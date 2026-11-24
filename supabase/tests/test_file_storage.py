"""Storage buckets and storage RLS (runs against the storage shim in conftest)."""

from __future__ import annotations

import re

import pytest
from psycopg import errors

from conftest import BROKER, OTHER_AGENT, OTHER_BROKER, RACHEL, add_staff, reset_user, savepoint, set_user

KEY_0142 = "deals/2026-0142/sales_contract/e4000000-0000-4000-8000-000000000102.pdf"
KEY_0138 = "deals/2026-0138/sellers_disclosure/e4000000-0000-4000-8000-000000000202.pdf"
KEY_OTHER = "deals/2026-0777/sales_contract/x.pdf"
KEY_TEMPLATE = "_templates/anything.docx"
ALL = (KEY_0142, KEY_0138, KEY_OTHER, KEY_TEMPLATE)


@pytest.fixture
def objects(db):
    """Objects in deal-files plus one in uploads-staging, written as the service role would."""
    for key in ALL:
        db.execute("insert into storage.objects (bucket_id, name) values ('deal-files', %s)", (key,))
    db.execute("insert into storage.objects (bucket_id, name) values ('uploads-staging', 'staging/2026-0142/a.pdf')")
    return db


def visible(db, bucket="deal-files") -> set[str]:
    return {r[0] for r in db.execute("select name from storage.objects where bucket_id = %s", (bucket,)).fetchall()}


@pytest.mark.parametrize("path, expected", [
    (KEY_0142, "2026-0142"),
    (KEY_TEMPLATE, None),
    ("deals/", None),
    ("", None),
    (None, None),
])
def test_deal_number_from_path(db, path, expected):
    assert db.execute("select public.deal_number_from_path(%s)", (path,)).fetchone()[0] == expected


@pytest.mark.parametrize("bucket", ["deal-files", "uploads-staging"])
def test_buckets_are_private_with_limits(db, bucket):
    public, limit, mimes = db.execute(
        "select public, file_size_limit, allowed_mime_types from storage.buckets where id = %s", (bucket,)).fetchone()
    assert public is False
    assert limit == 25 * 1024 * 1024
    assert set(mimes) == {"application/pdf", "image/jpeg", "image/png",
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}


@pytest.mark.parametrize("user, expected", [
    (BROKER, {KEY_0142, KEY_0138}),
    (RACHEL, {KEY_0142, KEY_0138}),
    ("99999999-0000-4000-8000-000000000000", set()),  # signed in but not staff
])
def test_staff_see_objects_only_for_deals_they_can_see(objects, user, expected):
    set_user(objects, user)
    assert visible(objects) == expected  # other deal numbers and templates are never user-readable


def test_agent_without_deals_and_other_brokerage_see_nothing(objects):
    add_staff(objects)
    for user in (OTHER_AGENT, OTHER_BROKER):
        reset_user(objects)
        set_user(objects, user)
        assert visible(objects) == set()


def test_anon_sees_no_objects(objects):
    set_user(objects, None, "anon")
    assert visible(objects) == set()


def test_staging_bucket_is_not_readable_by_staff(objects):
    set_user(objects, RACHEL)
    assert visible(objects, "uploads-staging") == set()


@pytest.mark.parametrize("bucket", ["deal-files", "uploads-staging"])
@pytest.mark.parametrize("role, user", [("authenticated", RACHEL), ("authenticated", BROKER), ("anon", None)])
def test_users_cannot_write_mara_buckets(objects, bucket, role, user):
    set_user(objects, user, role)
    with pytest.raises(errors.InsufficientPrivilege):
        with savepoint(objects):
            objects.execute("insert into storage.objects (bucket_id, name) values (%s, 'deals/2026-0142/x/new.pdf')",
                            (bucket,))
    objects.execute("update storage.objects set name = name || '.x'")
    objects.execute("delete from storage.objects")
    reset_user(objects)
    assert visible(objects) == set(ALL)
    assert len(visible(objects, "uploads-staging")) == 1


def test_service_role_can_write_deal_files(db):
    set_user(db, None, "service_role")
    db.execute("insert into storage.objects (bucket_id, name) values ('deal-files', 'deals/2026-0142/sales_contract/y.pdf')")
    db.execute("delete from storage.objects where name = 'deals/2026-0142/sales_contract/y.pdf'")


def test_seeded_file_paths_follow_the_object_key_rule(db):
    """deals/{deal_number}/{document_type_key}/{document_id}.{ext}"""
    rows = db.execute(
        "select d.deal_number, t.document_type_key, x.id::text, x.file_path "
        "from public.documents x join public.deals d on d.id = x.deal_id "
        "join public.checklist_items t on t.id = x.checklist_item_id where x.file_path is not null").fetchall()
    assert rows
    for deal_number, type_key, doc_id, path in rows:
        assert re.fullmatch(rf"deals/{deal_number}/{type_key}/{doc_id}\.(pdf|docx|jpg|png)", path), path
