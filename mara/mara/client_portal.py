"""POST /client/{action}: everything the client portal needs (docs/CONTRACTS.md §4, §7).

The web server calls these (HMAC-signed) with the raw portal token. Mara hashes it
(sha256), checks expiry/revocation and, for everything except portal/send_code/
verify_code, a valid 30-day session. Responses are camelCase JSON.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg

from mara.dbutil import audit, many, one, run
from mara.documents import ALLOWED_MIME, MAX_BYTES, ext_for
from mara.models import (
    ClientRequest,
    ConfirmUploadIn,
    CreateUploadIn,
    ItemIn,
    OptOutIn,
    VerifyCodeIn,
)
from mara.outbound.compose import first_name, verify_code_body
from mara.security.tokens import hash_code, new_code, new_token, safe_equal, sha256_hex
from mara.storage import UPLOADS_STAGING, FileStore, ObjectNotFoundError

MAX_ATTEMPTS = 5
LOCK_FOR = timedelta(minutes=15)
CODE_TTL = timedelta(minutes=10)
RESEND_AFTER = timedelta(seconds=30)
SESSION_TTL = timedelta(days=30)
ACCEPT_LABEL = "PDF, Word, JPG or PNG, up to 25 MB"


class ApiError(Exception):
    def __init__(self, status: int, code: str, **extra: Any) -> None:
        super().__init__(code)
        self.status, self.code, self.extra = status, code, extra


@dataclass
class ClientCtx:
    get_store: Callable[[], FileStore]
    dispatch_send: Callable[[str], None]  # spawns send_message(message_id)
    now: Callable[[], datetime] = lambda: datetime.now(UTC)  # noqa: E731
    verify: bool = True  # False: client links open without the SMS code (MARA_CLIENT_VERIFY=0)


# --- shared lookups -----------------------------------------------------------------


def _link(conn: psycopg.Connection, token: str, now: datetime) -> dict:
    link = one(
        conn,
        "select cl.id as link_id, cl.expires_at, cl.revoked_at, cl.session_hash, "
        "cl.session_expires_at, cl.verify_code_hash, cl.verify_code_expires_at, "
        "cl.verify_attempts, cl.locked_until, c.id as client_id, c.name as client_name, c.phone, "
        "c.sms_consent_at, c.sms_opt_out_at, d.id as deal_id, d.deal_number, "
        "d.property_address, d.city, d.state, d.zip, u.name as agent_name, u.phone as agent_phone "
        "from public.client_links cl join public.clients c on c.id = cl.client_id "
        "join public.deals d on d.id = c.deal_id left join public.users u on u.id = d.agent_id "
        "where cl.token_hash = %s",
        (sha256_hex(token),),
    )
    if link is None:
        raise ApiError(404, "link_invalid")
    if link["revoked_at"] is not None or (link["expires_at"] and link["expires_at"] <= now):
        raise ApiError(410, "link_expired")
    run(
        conn,
        "update public.client_links set last_used_at = %s where id = %s",
        (now, link["link_id"]),
    )
    return link


def _has_session(link: dict, session: str | None, now: datetime, verify: bool = True) -> bool:
    if not verify:
        return True  # demo without SMS (MARA_CLIENT_VERIFY=0): the link alone opens the portal
    return bool(
        session
        and link["session_hash"]
        and link["session_expires_at"]
        and link["session_expires_at"] > now
        and safe_equal(sha256_hex(session), link["session_hash"])
    )


def _need_session(link: dict, session: str | None, now: datetime, ctx: ClientCtx) -> None:
    if not _has_session(link, session, now, ctx.verify):
        raise ApiError(401, "session_required")


def _locked_seconds(link: dict, now: datetime) -> int:
    if link["locked_until"] and link["locked_until"] > now:
        return int((link["locked_until"] - now).total_seconds()) + 1
    return 0


def _mask(phone: str | None) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return f"•••-•••-{digits[-4:]}" if len(digits) >= 4 else "•••-•••-••••"


def _chip(status: str) -> tuple[str, dict]:
    return {
        "missing": ("to_do", {"label": "To do", "tone": "neutral"}),
        "needs_fix": ("needs_fix", {"label": "Needs a fix", "tone": "warn"}),
        "checking": ("checking", {"label": "Being checked", "tone": "info"}),
        "review": ("checking", {"label": "Checked · with your agent", "tone": "info"}),
        "complete": ("done", {"label": "Done", "tone": "ok"}),
    }[status]


_ITEM_SQL = (
    "select ci.id, ci.status, ci.fix_note, ci.due_date, ci.sort_order, dt.name, dt.description, "
    "(select max(created_at) from public.documents x where x.checklist_item_id = ci.id "
    "and x.status <> 'uploading') as uploaded_at "
    "from public.checklist_items ci join public.document_types dt on dt.key = ci.document_type_key "
    "where ci.deal_id = %s and ci.status <> 'waived' "
)


def _item_vm(r: dict) -> dict:
    status, chip = _chip(r["status"])
    return {
        "id": str(r["id"]),
        "name": r["name"],
        "description": r["description"],
        "status": status,
        "chip": chip,
        "checked": r["status"] == "review",
        "fixNote": r["fix_note"] if r["status"] == "needs_fix" else None,
        "dueDate": r["due_date"].isoformat() if r["due_date"] else None,
        "uploadedAt": r["uploaded_at"].isoformat() if r["uploaded_at"] else None,
    }


# --- actions ------------------------------------------------------------------------


def portal(conn, req: ClientRequest, ctx: ClientCtx) -> dict:
    now = ctx.now()
    link = _link(conn, req.token, now)
    locked = _locked_seconds(link, now)
    if locked:
        state, resend = "locked", locked
    else:
        state, resend = "ready", 0
        if link["verify_code_hash"] and link["verify_code_expires_at"]:
            issued = link["verify_code_expires_at"] - CODE_TTL
            resend = max(0, int((issued + RESEND_AFTER - now).total_seconds()))
            if link["verify_code_expires_at"] <= now:
                state = "expired"
    city_line = f"{link['city']}, {link['state']} {link['zip']}".strip(", ")
    return {
        "mode": "live",
        "token": req.token,
        "client": {"firstName": first_name(link["client_name"]), "name": link["client_name"]},
        "deal": {"address": link["property_address"], "cityLine": city_line},
        "agent": {"name": link["agent_name"] or "Your agent", "phone": link["agent_phone"]},
        "needsVerification": not _has_session(link, req.session, now, ctx.verify),
        "phoneMasked": _mask(link["phone"]),
        "state": state,
        "resendAfterSeconds": resend,
    }


def checklist(conn, req: ClientRequest, ctx: ClientCtx) -> dict:
    now = ctx.now()
    link = _link(conn, req.token, now)
    _need_session(link, req.session, now, ctx)
    items = [
        _item_vm(r) for r in many(conn, _ITEM_SQL + "order by ci.sort_order", (link["deal_id"],))
    ]
    to_do = [i for i in items if i["status"] in ("to_do", "needs_fix")]
    checking = [i for i in items if i["status"] == "checking"]
    done = [i for i in items if i["status"] == "done"]
    name = first_name(link["client_name"])
    if to_do:
        n = len(to_do)
        headline = f"Hi {name}, {n} thing{'s' if n != 1 else ''} left"
    elif checking:
        headline = f"Thanks {name}, we're checking your documents"
    else:
        headline = f"All done, {name}. Thank you!"
    return {
        "headline": headline,
        "doneCount": len(done),
        "totalCount": len(items),
        "toDo": to_do,
        "checking": checking,
        "done": done,
        "sms": {
            "optedOut": link["sms_opt_out_at"] is not None,
            "canToggle": link["sms_consent_at"] is not None,
        },
    }


def item(conn, req: ItemIn, ctx: ClientCtx) -> dict:
    now = ctx.now()
    link = _link(conn, req.token, now)
    _need_session(link, req.session, now, ctx)
    row = one(conn, _ITEM_SQL + "and ci.id = %s", (link["deal_id"], req.itemId))
    if row is None:
        raise ApiError(404, "item_not_found")
    docs = many(
        conn,
        "select id, original_filename, version, status, created_at from public.documents "
        "where checklist_item_id = %s and status <> 'uploading' order by version desc",
        (req.itemId,),
    )
    uploads = []
    for idx, d in enumerate(docs):
        if d["status"] == "superseded" or idx > 0:
            label = "Replaced"
        elif row["status"] == "complete":
            label = "Accepted"
        elif row["status"] == "needs_fix":
            label = "Needs a fix"
        else:
            label = "Being checked"
        uploads.append(
            {
                "id": str(d["id"]),
                "filename": d["original_filename"],
                "uploadedAt": d["created_at"].isoformat(),
                "statusLabel": label,
            }
        )
    return {
        "item": _item_vm(row),
        "uploads": uploads,
        "upload": {
            "maxBytes": MAX_BYTES,
            "acceptedTypes": sorted(ALLOWED_MIME),
            "acceptLabel": ACCEPT_LABEL,
        },
    }


def send_code(conn, req: ClientRequest, ctx: ClientCtx) -> dict:
    now = ctx.now()
    link = _link(conn, req.token, now)
    locked = _locked_seconds(link, now)
    if locked:
        return {"sent": False, "reason": "locked", "retryAfterSeconds": locked}
    if link["verify_code_hash"] and link["verify_code_expires_at"]:
        wait = (link["verify_code_expires_at"] - CODE_TTL + RESEND_AFTER - now).total_seconds()
        if wait > 0:
            return {"sent": False, "reason": "too_soon", "retryAfterSeconds": int(wait) + 1}
    code = new_code()
    # attempts are NOT reset here: asking for new codes must not give unlimited guesses
    run(
        conn,
        "update public.client_links set verify_code_hash = %s, verify_code_expires_at = %s "
        "where id = %s",
        (hash_code(code), now + CODE_TTL, link["link_id"]),
    )
    msg = one(
        conn,
        "insert into public.messages (deal_id, client_id, kind, body, status) "
        "values (%s, %s, 'verify_code', %s, 'queued') returning id",
        (link["deal_id"], link["client_id"], verify_code_body(code)),
    )
    audit(
        conn, link["deal_id"], "client", "client.code_requested", {"link_id": str(link["link_id"])}
    )
    ctx.dispatch_send(str(msg["id"]))
    return {"sent": True, "phoneMasked": _mask(link["phone"]), "expiresInSeconds": 600}


def verify_code(conn, req: VerifyCodeIn, ctx: ClientCtx) -> dict:
    now = ctx.now()
    link = _link(conn, req.token, now)
    locked = _locked_seconds(link, now)
    if locked:
        return {
            "verified": False,
            "attemptsLeft": 0,
            "reason": "locked",
            "retryAfterSeconds": locked,
        }
    attempts = link["verify_attempts"]
    left = MAX_ATTEMPTS - attempts
    if not link["verify_code_hash"]:
        return {"verified": False, "attemptsLeft": left, "reason": "no_code"}
    if link["verify_code_expires_at"] <= now:
        return {"verified": False, "attemptsLeft": left, "reason": "expired"}
    if safe_equal(hash_code(req.code), link["verify_code_hash"]):
        session = new_token()
        run(
            conn,
            "update public.client_links set verified_at = %s, verify_attempts = 0, "
            "locked_until = null, verify_code_hash = null, verify_code_expires_at = null, "
            "session_hash = %s, "
            "session_expires_at = %s where id = %s",
            (now, sha256_hex(session), now + SESSION_TTL, link["link_id"]),
        )
        audit(conn, link["deal_id"], "client", "client.verified", {"link_id": str(link["link_id"])})
        return {"verified": True, "attemptsLeft": MAX_ATTEMPTS, "session": session}
    attempts += 1
    if attempts >= MAX_ATTEMPTS:
        run(
            conn,
            "update public.client_links set verify_attempts = 0, verify_code_hash = null, "
            "verify_code_expires_at = null, locked_until = %s where id = %s",
            (now + LOCK_FOR, link["link_id"]),
        )
        audit(conn, link["deal_id"], "system", "client.locked", {"link_id": str(link["link_id"])})
        return {
            "verified": False,
            "attemptsLeft": 0,
            "reason": "locked",
            "retryAfterSeconds": int(LOCK_FOR.total_seconds()),
        }
    run(
        conn,
        "update public.client_links set verify_attempts = %s where id = %s",
        (attempts, link["link_id"]),
    )
    return {"verified": False, "attemptsLeft": MAX_ATTEMPTS - attempts, "reason": "wrong_code"}


_SAFE_NAME = re.compile(r"[\x00-\x1f\x7f/\\]")


def create_upload(conn, req: CreateUploadIn, ctx: ClientCtx) -> dict:
    now = ctx.now()
    link = _link(conn, req.token, now)
    _need_session(link, req.session, now, ctx)
    if req.mime not in ALLOWED_MIME:
        raise ApiError(422, "unsupported_type", acceptedTypes=sorted(ALLOWED_MIME))
    if req.sizeBytes > MAX_BYTES:
        raise ApiError(422, "too_large", maxBytes=MAX_BYTES)
    row = one(
        conn,
        "select ci.id, ci.status, ci.document_type_key from public.checklist_items ci "
        "where ci.id = %s and ci.deal_id = %s",
        (req.itemId, link["deal_id"]),
    )
    if row is None:
        raise ApiError(404, "item_not_found")
    if row["status"] not in ("missing", "needs_fix"):
        raise ApiError(409, "item_not_open")
    doc_id = uuid.uuid4()
    key = f"deals/{link['deal_number']}/{row['document_type_key']}/{doc_id}.{ext_for(req.mime)}"
    filename = _SAFE_NAME.sub("_", req.filename).strip()[:255] or "upload"
    upload_url = ctx.get_store().signed_upload_url(key)
    run(
        conn,
        "insert into public.documents (id, deal_id, checklist_item_id, version, staging_path, "
        "original_filename, mime, size_bytes, status) values (%s, %s, %s, "
        "(select coalesce(max(version), 0) + 1 from public.documents "
        "where checklist_item_id = %s), "
        "%s, %s, %s, %s, 'uploading')",
        (doc_id, link["deal_id"], row["id"], row["id"], key, filename, req.mime, req.sizeBytes),
    )
    return {"documentId": str(doc_id), "uploadUrl": upload_url}


def confirm_upload(conn, req: ConfirmUploadIn, ctx: ClientCtx) -> dict:
    now = ctx.now()
    link = _link(conn, req.token, now)
    _need_session(link, req.session, now, ctx)
    doc = one(
        conn,
        "select id, checklist_item_id, staging_path, status, size_bytes from public.documents "
        "where id = %s and deal_id = %s",
        (req.documentId, link["deal_id"]),
    )
    if doc is None:
        raise ApiError(404, "document_not_found")
    if doc["status"] != "uploading":
        return {"documentId": str(doc["id"]), "status": "checking"}  # confirm is idempotent
    try:
        present = ctx.get_store().exists(UPLOADS_STAGING, doc["staging_path"])
    except ObjectNotFoundError:
        present = False
    if not present:
        raise ApiError(409, "upload_missing")
    with conn.transaction():
        run(conn, "update public.documents set status = 'received' where id = %s", (doc["id"],))
        run(
            conn,
            "update public.checklist_items set status = 'checking', fix_note = null "
            "where id = %s and status in ('missing', 'needs_fix')",
            (doc["checklist_item_id"],),
        )
        audit(conn, link["deal_id"], "client", "client.uploaded", {"document_id": str(doc["id"])})
    return {"documentId": str(doc["id"]), "status": "checking"}


def set_opt_out(conn, req: OptOutIn, ctx: ClientCtx) -> dict:
    now = ctx.now()
    link = _link(conn, req.token, now)
    _need_session(link, req.session, now, ctx)
    run(
        conn,
        "update public.clients set sms_opt_out_at = %s where id = %s",
        (now if req.optOut else None, link["client_id"]),
    )
    audit(
        conn, link["deal_id"], "client", "client.sms_opt_out" if req.optOut else "client.sms_opt_in"
    )
    return {"optedOut": req.optOut}


ACTIONS: dict[str, tuple[type[ClientRequest], Callable[..., dict]]] = {
    "portal": (ClientRequest, portal),
    "checklist": (ClientRequest, checklist),
    "item": (ItemIn, item),
    "send_code": (ClientRequest, send_code),
    "verify_code": (VerifyCodeIn, verify_code),
    "create_upload": (CreateUploadIn, create_upload),
    "confirm_upload": (ConfirmUploadIn, confirm_upload),
    "set_opt_out": (OptOutIn, set_opt_out),
}
