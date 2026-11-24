"""process_document (docs/CONTRACTS.md §4): file the upload, check it, queue it for review.

Idempotent: only a document in status `received` is claimed. On any failure the document
becomes `failed`, one blocker finding is written and the item goes to `review`, so the
agent always decides.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import psycopg

from mara import checker as ck
from mara.config import load_standard
from mara.dbutil import audit, many, one, record_ai_run, run
from mara.documents import ext_for, prepare, sha256_hex
from mara.storage import DEAL_FILES, UPLOADS_STAGING, FileStore, deal_file_key

log = logging.getLogger("mara.pipeline")

UNREADABLE_MESSAGE = "Mara couldn't read this file"
UNREADABLE_FIX = (
    "We couldn't open this file. Please upload a clear, complete copy "
    "(a PDF, a photo or a Word document)."
)


def _claim(conn: psycopg.Connection, document_id) -> dict | None:
    with conn.transaction():
        doc = one(
            conn,
            "update public.documents d set status = 'processing' "
            "from public.checklist_items ci, public.deals dl "
            "where d.id = %s and d.status = 'received' "
            "and ci.id = d.checklist_item_id and dl.id = d.deal_id "
            "returning d.id, d.deal_id, d.checklist_item_id, d.version, d.staging_path, "
            "d.file_path, d.original_filename, d.mime, ci.document_type_key, dl.deal_number",
            (document_id,),
        )
        if doc is None:
            return None
        run(
            conn,
            "update public.documents set status = 'superseded' "
            "where checklist_item_id = %s and version < %s "
            "and status in ('received', 'processing', 'checked', 'failed')",
            (doc["checklist_item_id"], doc["version"]),
        )
    return doc


def process_document(
    conn: psycopg.Connection, document_id, *, store: FileStore, checker: ck.Checker
) -> str:
    """Returns 'checked', 'failed' or 'skipped' (not in `received`)."""
    doc = _claim(conn, document_id)
    if doc is None:
        log.info("process_document: %s is not in 'received'; skipping", document_id)
        return "skipped"
    state: dict = {"model_called": False}
    try:
        result = _process(conn, doc, store, checker, state)
    except Exception as exc:
        log.warning("process_document %s failed: %s", document_id, exc.__class__.__name__)
        _fail(conn, doc, exc, checker, state)
        return "failed"
    _finish(conn, doc, result)
    return "checked"


def _process(conn, doc: dict, store: FileStore, checker: ck.Checker, state: dict) -> ck.CheckResult:
    ext = ext_for(doc["mime"])
    key = deal_file_key(doc["deal_number"], doc["document_type_key"], doc["id"], ext)

    # Retry-safe: if an earlier attempt already filed it, read from deal-files.
    if doc["file_path"] and store.exists(DEAL_FILES, doc["file_path"]):
        data = store.get(DEAL_FILES, doc["file_path"])
    else:
        data = store.get(UPLOADS_STAGING, doc["staging_path"])
    parsed = prepare(data, doc["mime"])

    if not store.exists(DEAL_FILES, key):
        store.put(DEAL_FILES, key, data, doc["mime"])
    if not store.exists(DEAL_FILES, key):
        raise RuntimeError("file did not land in deal-files")
    run(
        conn,
        "update public.documents set file_path = %s, sha256 = %s, page_count = %s where id = %s",
        (key, sha256_hex(data), parsed.page_count, doc["id"]),
    )
    if doc["staging_path"]:
        try:
            store.remove_staging(doc["staging_path"])
        except Exception:
            log.warning("could not remove staging copy of %s", doc["id"])

    dtype = one(
        conn,
        "select name, description, standard_key from public.document_types where key = %s",
        (doc["document_type_key"],),
    )
    if dtype is None:
        raise RuntimeError("unknown document type")
    standard = load_standard(dtype["standard_key"])
    client = one(conn, "select name from public.clients where deal_id = %s", (doc["deal_id"],))
    context = ck.CheckContext(
        today=datetime.now(UTC).date(), client_name=client["name"] if client else None
    )
    state["model_called"] = True
    return ck.run_check(
        checker, standard, dtype["name"], dtype["description"], parsed, context=context
    )


def _finish(conn: psycopg.Connection, doc: dict, r: ck.CheckResult) -> None:
    with conn.transaction():
        for f in r.findings:
            run(
                conn,
                "insert into public.findings (document_id, checklist_item_id, severity, rule_key, "
                "message, client_fix_text, page, quote, status) "
                "values (%s, %s, %s, %s, %s, %s, %s, %s, 'open')",
                (
                    doc["id"],
                    doc["checklist_item_id"],
                    f.severity,
                    f.rule_key,
                    f.message,
                    f.client_fix_text,
                    f.page,
                    f.quote,
                ),
            )
        run(
            conn,
            "update public.documents set status = 'checked', ai_summary = %s, checked_at = now() "
            "where id = %s",
            (r.summary, doc["id"]),
        )
        run(
            conn,
            "update public.checklist_items set status = 'review' "
            "where id = %s and status = 'checking'",
            (doc["checklist_item_id"],),
        )
        record_ai_run(
            conn,
            deal_id=doc["deal_id"],
            document_id=doc["id"],
            purpose=ck.PURPOSE,
            model=r.model,
            prompt_version=r.prompt_version,
            input_tokens=r.input_tokens,
            output_tokens=r.output_tokens,
            cost_usd=r.cost_usd,
            output_json=r.output_json,
        )
        audit(
            conn,
            doc["deal_id"],
            "mara",
            "document.checked",
            {
                "document_id": str(doc["id"]),
                "findings": len(r.findings),
                "blockers": sum(f.severity == "blocker" for f in r.findings),
            },
        )


def _fail(conn: psycopg.Connection, doc: dict, exc: Exception, checker, state: dict) -> None:
    reason = exc.__class__.__name__
    with conn.transaction():
        run(conn, "update public.documents set status = 'failed' where id = %s", (doc["id"],))
        run(
            conn,
            "insert into public.findings (document_id, checklist_item_id, severity, rule_key, "
            "message, client_fix_text, page, quote, status) "
            "values (%s, %s, 'blocker', 'unreadable', %s, %s, null, null, 'open')",
            (doc["id"], doc["checklist_item_id"], UNREADABLE_MESSAGE, UNREADABLE_FIX),
        )
        run(
            conn,
            "update public.checklist_items set status = 'review' "
            "where id = %s and status = 'checking'",
            (doc["checklist_item_id"],),
        )
        if state.get("model_called"):
            record_ai_run(
                conn,
                deal_id=doc["deal_id"],
                document_id=doc["id"],
                purpose=ck.PURPOSE,
                model=getattr(checker, "model", "unknown"),
                prompt_version=getattr(checker, "prompt_version", "unknown"),
                input_tokens=None,
                output_tokens=None,
                cost_usd=None,
                output_json={"error": reason},
            )
        audit(
            conn,
            doc["deal_id"],
            "mara",
            "document.failed",
            {"document_id": str(doc["id"]), "reason": reason},
        )


def stuck_documents(conn: psycopg.Connection, minutes: int, now: datetime) -> list[dict]:
    return many(
        conn,
        "select id from public.documents where status = 'received' and created_at < %s",
        (now - timedelta(minutes=minutes),),
    )
