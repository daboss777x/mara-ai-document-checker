import uuid

import psycopg

from mara import jobs


def test_claim_is_idempotent(db):
    ref = uuid.uuid4()
    key = jobs.idempotency_key("document.created", ref)
    first = jobs.claim(db, key, "document.created", ref)
    assert first is not None
    assert jobs.claim(db, key, "document.created", ref) is None


def test_status_transitions(db):
    job_id = jobs.claim(db, "k:1", "document.created")
    jobs.mark_running(db, job_id)
    assert db.execute(
        "select status, attempts from public.mara_jobs where id = %s", (job_id,)
    ).fetchone() == ("running", 1)
    jobs.mark_failed(db, job_id, "boom")
    assert db.execute(
        "select status, last_error from public.mara_jobs where id = %s", (job_id,)
    ).fetchone() == ("failed", "boom")
    jobs.mark_done(db, job_id)
    assert db.execute(
        "select status, last_error from public.mara_jobs where id = %s", (job_id,)
    ).fetchone() == ("done", None)


def test_sweep_lock_excludes_second_connection(pg_dsn):
    with (
        psycopg.connect(pg_dsn, autocommit=True) as a,
        psycopg.connect(pg_dsn, autocommit=True) as b,
    ):
        with jobs.sweep_lock(a) as got_a:
            assert got_a is True
            with jobs.sweep_lock(b) as got_b:
                assert got_b is False
        with jobs.sweep_lock(b) as got_b:
            assert got_b is True
