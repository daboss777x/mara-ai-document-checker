"""Modal app "mara": the ASGI endpoints, the spawned jobs and the hourly sweep.

Deploy (the --env flag only selects the Modal environment; each environment has its
own "mara-secrets" Secret pointing at the matching Supabase project):

    cd mara
    uv run modal deploy --env staging app.py
    uv run modal deploy --env prod app.py

Secret keys: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, MARA_HMAC_SECRET,
ANTHROPIC_API_KEY, MARA_CHECK_MODEL (optional), EGOSMS_USERNAME, EGOSMS_PASSWORD,
EGOSMS_SENDER_ID, PUBLIC_SITE_URL.
"""

from __future__ import annotations

import logging
from uuid import UUID

import modal

log = logging.getLogger("mara.app")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_sync(".", extra_options="--no-dev")
    .add_local_python_source("mara")
    .add_local_dir("../config", "/root/config")
    .add_local_dir("../prompts", "/root/prompts")
)

app = modal.App("mara", image=image, secrets=[modal.Secret.from_name("mara-secrets")])


def _setup() -> None:
    logging.basicConfig(level=logging.INFO)


def _run_job(job_id: str | None, fn) -> None:
    """Run fn(conn) and keep the mara_jobs row (if any) in step."""
    from mara import jobs
    from mara.db import connection

    with connection() as conn:
        if job_id:
            jobs.mark_running(conn, job_id)
        try:
            fn(conn)
        except Exception as exc:
            if job_id:
                jobs.mark_failed(conn, job_id, repr(exc))
            raise
        if job_id:
            jobs.mark_done(conn, job_id)


@app.function(timeout=900)
def process_document(document_id: str, job_id: str | None = None) -> None:
    """CONTRACTS §4: file, read, check, queue for review. Idempotent."""
    _setup()
    from mara.checker import ClaudeChecker
    from mara.pipeline import process_document as run
    from mara.storage import get_file_store

    def work(conn):
        outcome = run(conn, document_id, store=get_file_store(), checker=ClaudeChecker())
        log.info("process_document %s: %s", document_id, outcome)

    _run_job(job_id, work)


@app.function(timeout=120)
def send_message(message_id: str, job_id: str | None = None) -> None:
    """The only function that can reach an SMS provider (via mara.outbound.sender)."""
    _setup()
    from mara.outbound.sender import send_message as send

    def work(conn):
        outcome = send(conn, message_id)
        log.info("send_message %s: %s %s", message_id, outcome.status, outcome.reason)

    _run_job(job_id, work)


def _dispatch_event(event, job_id: UUID) -> None:
    if event.type == "document.created":
        process_document.spawn(str(event.id), str(job_id))
    else:
        send_message.spawn(str(event.id), str(job_id))


def _dispatch_send(message_id: str) -> None:
    send_message.spawn(message_id)


@app.function()
@modal.asgi_app()
def web():
    _setup()
    from mara.api import create_app

    return create_app(dispatcher=_dispatch_event, dispatch_send=_dispatch_send)


@app.function(schedule=modal.Cron("0 * * * *"), timeout=600)
def hourly_sweep() -> None:
    """Stuck documents, queued-message retries and reminders (one advisory lock)."""
    _setup()
    from mara import jobs
    from mara.db import connection
    from mara.settings import get_settings
    from mara.sweep import run_sweep

    if get_settings().database_url is None:
        log.warning("hourly_sweep: DATABASE_URL not set; skipping")
        return
    with connection() as conn, jobs.sweep_lock(conn) as got:
        if not got:
            log.info("hourly_sweep: another sweep holds the lock; skipping")
            return
        summary = run_sweep(
            conn,
            dispatch_document=lambda doc_id: process_document.spawn(doc_id),
            dispatch_send=_dispatch_send,
        )
        log.info("hourly_sweep done: %s", summary)
