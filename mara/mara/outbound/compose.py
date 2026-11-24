"""Message text from config/messages.yaml, and portal links.

The raw portal token is never stored (only its sha256), so every SMS that needs a link
mints a fresh `client_links` row and puts that token in the text.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import psycopg

from mara.config import load_messages
from mara.dbutil import run
from mara.security.tokens import new_token, sha256_hex
from mara.settings import Settings, get_settings, require

LINK_DAYS = 30


def mint_portal_link(
    conn: psycopg.Connection,
    client_id,
    settings: Settings | None = None,
    now: datetime | None = None,
) -> str:
    """Create a new client_links row and return the full portal URL."""
    settings = settings or get_settings()
    site = require(settings.public_site_url, "PUBLIC_SITE_URL").rstrip("/")
    now = now or datetime.now(UTC)
    token = new_token()
    run(
        conn,
        "insert into public.client_links (client_id, token_hash, expires_at) values (%s, %s, %s)",
        (client_id, sha256_hex(token), now + timedelta(days=LINK_DAYS)),
    )
    return f"{site}/c/{token}"


def first_name(name: str) -> str:
    return (name or "there").split()[0]


def render(template: str, **values: str) -> str:
    out = " ".join(template.split())  # YAML folded scalars: collapse whitespace
    for k, v in values.items():
        out = out.replace("{" + k + "}", v)
    return out


def item_list(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def reminder_body(conn, client: dict, deal: dict, item_names: list[str], settings=None) -> str:
    link = mint_portal_link(conn, client["id"], settings)
    return render(
        load_messages().reminder,
        first_name=first_name(client["name"]),
        address=deal["property_address"],
        items=item_list(item_names),
        portal_link=link,
    )


def with_fix_footer(conn, client_id, body: str, settings=None) -> str:
    link = mint_portal_link(conn, client_id, settings)
    footer = render(load_messages().fix_request_footer, portal_link=link)
    return f"{body.strip()}\n\n{footer}"


def verify_code_body(code: str) -> str:
    return render(load_messages().verify_code, code=code)
