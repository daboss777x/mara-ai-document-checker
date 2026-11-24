import pytest

from mara import checker as ck
from mara.config import load_standard
from mara.pipeline import process_document
from mara.storage import DEAL_FILES, UPLOADS_STAGING, InMemoryFileStore
from tests.helpers import PDF, output_failing

STD = load_standard("sales_contract")


def make_doc(db, seed, *, data=PDF, version=1, status="received", mime="application/pdf"):
    doc_id = seed["new_id"]()
    key = f"deals/{seed['deal_number']}/sales_contract/{doc_id}.pdf"
    db.execute(
        "insert into documents (id, deal_id, checklist_item_id, version, staging_path, "
        "original_filename, mime, size_bytes, status) "
        "values (%s,%s,%s,%s,%s,'contract.pdf',%s,%s,%s)",
        (
            doc_id,
            seed["deal"],
            seed["items"]["sales_contract"],
            version,
            key,
            mime,
            len(data),
            status,
        ),
    )
    db.execute(
        "update checklist_items set status = 'checking' where id = %s",
        (seed["items"]["sales_contract"],),
    )
    store = InMemoryFileStore()
    store.put(UPLOADS_STAGING, key, data, mime)
    return doc_id, key, store


def row(db, sql, *p):
    return db.execute(sql, p).fetchall()


def test_happy_path_files_checks_and_queues_for_review(db, seed):
    doc_id, key, store = make_doc(db, seed)
    checker = ck.FakeChecker(lambda s, d: output_failing(s, "seller_signature"))
    assert process_document(db, doc_id, store=store, checker=checker) == "checked"

    status, file_path, sha, pages, summary = row(
        db,
        "select status, file_path, sha256, page_count, ai_summary from documents where id=%s",
        doc_id,
    )[0]
    assert status == "checked" and pages == 1 and len(sha) == 64 and summary == "Test summary."
    assert file_path == key and store.exists(DEAL_FILES, key)
    assert not store.exists(UPLOADS_STAGING, key)  # staging copy removed after the write
    assert row(db, "select rule_key, severity, status from findings") == [
        ("seller_signature", "blocker", "open")
    ]
    assert row(
        db, "select status from checklist_items where id=%s", seed["items"]["sales_contract"]
    ) == [("review",)]
    assert row(db, "select purpose, model, prompt_version from ai_runs") == [
        ("check_document", "fake-checker", "check-document@vfake")
    ]
    assert ("mara", "document.checked") in row(db, "select actor, action from audit_log")


def test_second_run_is_a_no_op(db, seed):
    doc_id, _, store = make_doc(db, seed)
    checker = ck.FakeChecker()
    assert process_document(db, doc_id, store=store, checker=checker) == "checked"
    assert process_document(db, doc_id, store=store, checker=checker) == "skipped"
    assert checker.calls == 1


def test_new_version_supersedes_the_old_one(db, seed):
    old_id, _, store = make_doc(db, seed, version=1, status="checked")
    new_id, key, store2 = make_doc(db, seed, version=2)
    process_document(db, new_id, store=store2, checker=ck.FakeChecker())
    assert row(db, "select status from documents where id=%s", old_id) == [("superseded",)]
    assert row(db, "select status from documents where id=%s", new_id) == [("checked",)]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"data": b"%PDF-1.4 garbage"},  # not a real PDF
        {"data": b"hello", "mime": "application/pdf"},  # wrong magic bytes
        {"data": b"x", "mime": "text/plain"},  # unsupported type
    ],
)
def test_unreadable_files_take_the_failure_path(db, seed, kwargs):
    doc_id, _, store = make_doc(db, seed, **kwargs)
    checker = ck.FakeChecker()
    assert process_document(db, doc_id, store=store, checker=checker) == "failed"
    assert checker.calls == 0
    assert row(db, "select status from documents where id=%s", doc_id) == [("failed",)]
    assert row(db, "select severity, rule_key, message from findings") == [
        ("blocker", "unreadable", "Mara couldn't read this file")
    ]
    assert row(
        db, "select status from checklist_items where id=%s", seed["items"]["sales_contract"]
    ) == [("review",)]
    assert row(db, "select count(*) from ai_runs") == [(0,)]  # no model call, no run


def test_model_failure_takes_the_failure_path_and_logs_the_run(db, seed):
    doc_id, _, store = make_doc(db, seed)
    checker = ck.FakeChecker(raises=ck.CheckerError("boom"))
    assert process_document(db, doc_id, store=store, checker=checker) == "failed"
    assert row(db, "select output_json from ai_runs") == [({"error": "CheckerError"},)]
    assert ("mara", "document.failed") in row(db, "select actor, action from audit_log")


def test_model_says_unreadable(db, seed):
    doc_id, _, store = make_doc(db, seed)
    checker = ck.FakeChecker(ck.ModelOutput(summary="too blurry", readable=False))
    assert process_document(db, doc_id, store=store, checker=checker) == "failed"
