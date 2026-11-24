"""FastAPI app factory. Pure: no Modal import, so tests build it directly.

Endpoints (docs/CONTRACTS.md §4), all HMAC-signed with X-Mara-Signature:
- POST /events            Supabase webhook {type, id} -> idempotent mara_jobs -> spawn
- POST /client/{action}   web server -> Mara; the client portal's only data path
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import UTC, datetime
from uuid import UUID

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from mara import jobs
from mara.client_portal import ACTIONS, ApiError, ClientCtx
from mara.db import connection as default_connection
from mara.models import EventIn
from mara.security import hmac as mara_hmac
from mara.settings import Settings, get_settings
from mara.storage import FileStore, get_file_store

log = logging.getLogger("mara.api")

Dispatcher = Callable[[EventIn, UUID], None]
ConnFactory = Callable[[], AbstractContextManager[psycopg.Connection]]


def log_dispatcher(event: EventIn, job_id: UUID) -> None:
    log.info("event queued (log-only dispatcher): type=%s job_id=%s", event.type, job_id)


def _error(status: int, code: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": code, **extra})


def create_app(
    *,
    settings: Settings | None = None,
    conn_factory: ConnFactory | None = None,
    dispatcher: Dispatcher | None = None,
    dispatch_send: Callable[[str], None] | None = None,
    store_factory: Callable[[], FileStore] | None = None,
    clock: Callable[[], float] = time.time,
) -> FastAPI:
    settings = settings or get_settings()
    conn_factory = conn_factory or default_connection
    dispatcher = dispatcher or log_dispatcher
    dispatch_send = dispatch_send or (lambda message_id: log.info("send queued: %s", message_id))
    store_factory = store_factory or (lambda: get_file_store(settings))

    app = FastAPI(title="Mara", docs_url=None, redoc_url=None, openapi_url=None)

    def _signed(request: Request, body: bytes) -> bool:
        secret = settings.mara_hmac_secret
        if secret is None:
            log.error("MARA_HMAC_SECRET is not set; rejecting signed requests")
        return mara_hmac.verify(
            secret.get_secret_value() if secret else None,
            request.headers.get(mara_hmac.HEADER_NAME),
            body,
            now=int(clock()),
        )

    def _invalid_body(err: ValidationError) -> JSONResponse:
        return _error(
            422,
            "invalid_body",
            details=json.loads(err.json(include_url=False, include_input=False)),
        )

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "env": settings.mara_env}

    @app.post("/events", status_code=202)
    async def events(request: Request):
        body = await request.body()
        if not _signed(request, body):
            return _error(401, "invalid_signature")
        try:
            event = EventIn.model_validate_json(body)
        except ValidationError as err:
            return _invalid_body(err)

        key = jobs.idempotency_key(event.type, event.id)

        def _claim() -> UUID | None:
            with conn_factory() as conn:
                return jobs.claim(conn, key, event.type, event.id)

        try:
            job_id = await run_in_threadpool(_claim)
        except Exception:
            log.exception("could not claim job %s", key)
            return _error(503, "database_unavailable")
        if job_id is None:
            log.info("duplicate event ignored: %s", key)
            return JSONResponse(status_code=202, content={"status": "duplicate"})
        try:
            await run_in_threadpool(dispatcher, event, job_id)
        except Exception as exc:
            log.exception("dispatch failed for job %s", job_id)
            err_text = f"dispatch: {exc!r}"

            def _fail() -> None:
                with conn_factory() as conn:
                    jobs.mark_failed(conn, job_id, err_text)

            try:
                await run_in_threadpool(_fail)
            except Exception:
                log.exception("could not mark job %s failed", job_id)
            return _error(500, "dispatch_failed", job_id=str(job_id))
        return JSONResponse(status_code=202, content={"status": "queued", "job_id": str(job_id)})

    @app.post("/client/{action}")
    async def client(action: str, request: Request):
        body = await request.body()
        if not _signed(request, body):
            return _error(401, "invalid_signature")
        entry = ACTIONS.get(action)
        if entry is None:
            return _error(404, "unknown_action")
        model, handler = entry
        try:
            req = model.model_validate_json(body)
        except ValidationError as err:
            return _invalid_body(err)
        ctx = ClientCtx(
            get_store=store_factory,
            dispatch_send=dispatch_send,
            now=lambda: datetime.fromtimestamp(clock(), UTC),
            verify=settings.mara_client_verify,
        )

        def _call() -> dict:
            with conn_factory() as conn:
                return handler(conn, req, ctx)

        try:
            return JSONResponse(content=await run_in_threadpool(_call))
        except ApiError as err:
            return _error(err.status, err.code, **err.extra)
        except Exception:
            log.exception("client/%s failed", action)
            return _error(500, "server_error")

    return app
