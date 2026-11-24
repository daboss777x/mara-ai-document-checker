"""mara.storage: key helpers, InMemoryFileStore and the Supabase REST adapter (mocked)."""

from __future__ import annotations

import json
from datetime import date
from uuid import UUID

import httpx
import pytest
from pydantic import ValidationError

from mara.settings import MissingSettingError, Settings
from mara.storage import (
    DEAL_FILES,
    UPLOADS_STAGING,
    FileStore,
    InMemoryFileStore,
    InvalidKeyError,
    ObjectExistsError,
    ObjectNotFoundError,
    StorageAuthError,
    StorageError,
    StorageForbiddenOperation,
    StorageUnavailableError,
    SupabaseFileStore,
    deal_file_key,
    download_name,
    inbox_key,
    template_key,
)

DOC = UUID("6f1c2a7e-3b0d-4e55-9a1f-2c8d4b7e9a10")
URL = "https://demo-project.supabase.co"
KEY = "service-role-test-key"
INBOX = f"deals/2026-0142/_Inbox/{DOC}.pdf"
FILED = f"deals/2026-0142/02 Contract & Amendments/{DOC}.pdf"


# --- key helpers ------------------------------------------------------------------


def test_deal_file_key_shape():
    assert deal_file_key("2026-0142", "02 Contract & Amendments", DOC, "PDF") == FILED
    assert deal_file_key("2026-0142", "03 Disclosures", str(DOC), ".pdf").endswith(f"/{DOC}.pdf")


def test_inbox_key_shape():
    assert inbox_key("2026-0142", DOC, "pdf") == INBOX


def test_template_key_shape():
    assert template_key("buyer_welcome") == "_templates/buyer_welcome.docx"


@pytest.mark.parametrize(
    "args",
    [
        ("2026/0142", "03 Disclosures", DOC, "pdf"),  # slash in deal number
        ("", "03 Disclosures", DOC, "pdf"),
        ("2026-0142", "../etc", DOC, "pdf"),
        ("2026-0142", "a/b", DOC, "pdf"),
        ("2026-0142", "_Inbox", DOC, "pdf"),  # use inbox_key for that
        ("2026-0142", "03 Disclosures", "not-a-uuid", "pdf"),
        ("2026-0142", "03 Disclosures", DOC, "p/df"),
        ("2026-0142", "03 Disclosures", DOC, ""),
    ],
)
def test_deal_file_key_rejects_bad_input(args):
    with pytest.raises(ValidationError):
        deal_file_key(*args)


def test_download_name_matches_plan_example():
    assert (
        download_name(date(2026, 11, 20), "Amendment", 2, "operative", "pdf")
        == "2026-11-20_Amendment_v2_OPERATIVE.pdf"
    )
    assert (
        download_name("2026-11-20", "seller_disclosure", 1, "SUPERSEDED", ".PDF")
        == "2026-11-20_SellerDisclosure_v1_SUPERSEDED.pdf"
    )


def test_download_name_validates():
    with pytest.raises(ValidationError):
        download_name("2026-13-40", "Amendment", 1, "OPERATIVE", "pdf")
    with pytest.raises(ValidationError):
        download_name(date(2026, 1, 1), "Amendment", 0, "OPERATIVE", "pdf")
    with pytest.raises(ValueError):
        download_name(date(2026, 1, 1), "///", 1, "OPERATIVE", "pdf")


# --- InMemoryFileStore ------------------------------------------------------------


def test_in_memory_satisfies_protocol():
    assert isinstance(InMemoryFileStore(), FileStore)
    assert not hasattr(InMemoryFileStore(), "delete")


def test_in_memory_put_get_exists_and_no_overwrite():
    fs = InMemoryFileStore()
    fs.put(DEAL_FILES, INBOX, b"%PDF-1", "application/pdf")
    assert fs.get(DEAL_FILES, INBOX) == b"%PDF-1"
    assert fs.exists(DEAL_FILES, INBOX) and not fs.exists(UPLOADS_STAGING, INBOX)
    assert fs.info(DEAL_FILES, INBOX).size == 6
    with pytest.raises(ObjectExistsError):
        fs.put(DEAL_FILES, INBOX, b"other", "application/pdf")
    with pytest.raises(ObjectNotFoundError):
        fs.get(DEAL_FILES, FILED)


def test_in_memory_move_inbox_to_subfolder_only():
    fs = InMemoryFileStore()
    fs.put(DEAL_FILES, INBOX, b"x", "application/pdf")
    fs.move(DEAL_FILES, INBOX, FILED)
    assert fs.exists(DEAL_FILES, FILED) and not fs.exists(DEAL_FILES, INBOX)
    other = f"deals/2026-0142/03 Disclosures/{DOC}.pdf"
    with pytest.raises(StorageForbiddenOperation):
        fs.move(DEAL_FILES, FILED, other)  # filed keys never change
    with pytest.raises(StorageForbiddenOperation):
        fs.move(DEAL_FILES, INBOX, f"deals/2026-0999/03 Disclosures/{DOC}.pdf")  # other deal


def test_in_memory_signed_url_and_remove_staging():
    fs = InMemoryFileStore()
    fs.put(UPLOADS_STAGING, "u/abc.pdf", b"x", "application/pdf")
    fs.put(DEAL_FILES, FILED, b"x", "application/pdf")
    url = fs.signed_url(DEAL_FILES, FILED, 60, "2026-11-20_Amendment_v2_OPERATIVE.pdf")
    assert "expires=60" in url and "download=2026-11-20_Amendment_v2_OPERATIVE.pdf" in url
    fs.remove_staging("u/abc.pdf")
    assert not fs.exists(UPLOADS_STAGING, "u/abc.pdf")
    fs.remove_staging(FILED)  # targets uploads-staging only: the deal file is untouched
    assert fs.exists(DEAL_FILES, FILED)


@pytest.mark.parametrize("key", ["/abs", "a//b", "a/../b", "trail/", "", "a\\b", "a\x00b"])
def test_bad_keys_rejected(key):
    with pytest.raises(InvalidKeyError):
        InMemoryFileStore().put(DEAL_FILES, key, b"x", "text/plain")


def test_unknown_bucket_rejected():
    with pytest.raises(StorageForbiddenOperation):
        InMemoryFileStore().get("public", "a.pdf")


# --- SupabaseFileStore (httpx.MockTransport; nothing leaves the process) ----------


class Recorder:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        r = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(r, Exception):
            raise r
        return r


def store(rec: Recorder, **kw) -> SupabaseFileStore:
    sleeps: list[float] = []
    fs = SupabaseFileStore(
        URL + "/", KEY, transport=httpx.MockTransport(rec), sleep=sleeps.append, **kw
    )
    fs.sleeps = sleeps  # type: ignore[attr-defined]
    return fs


def _assert_auth(req: httpx.Request):
    assert req.headers["authorization"] == f"Bearer {KEY}"
    assert req.headers["apikey"] == KEY


def test_supabase_satisfies_protocol():
    assert isinstance(store(Recorder(httpx.Response(200))), FileStore)


def test_put_request_shape():
    rec = Recorder(httpx.Response(200, json={"Key": f"deal-files/{INBOX}"}))
    store(rec).put(DEAL_FILES, INBOX, b"%PDF", "application/pdf")
    (req,) = rec.requests
    assert req.method == "POST"
    assert req.url.raw_path.decode() == (
        f"/storage/v1/object/deal-files/deals/2026-0142/_Inbox/{DOC}.pdf"
    )
    assert req.headers["content-type"] == "application/pdf"
    assert req.headers["x-upsert"] == "false"
    assert req.content == b"%PDF"
    _assert_auth(req)


def test_put_key_with_spaces_and_ampersand_is_encoded():
    rec = Recorder(httpx.Response(200, json={}))
    store(rec).put(DEAL_FILES, FILED, b"x", "application/pdf")
    assert "/02%20Contract%20%26%20Amendments/" in rec.requests[0].url.raw_path.decode()


def test_put_duplicate_raises_exists():
    rec = Recorder(httpx.Response(400, json={"statusCode": "409", "error": "Duplicate"}))
    with pytest.raises(ObjectExistsError):
        store(rec).put(DEAL_FILES, INBOX, b"x", "application/pdf")


def test_put_retry_after_lost_response_is_idempotent():
    rec = Recorder(
        httpx.Response(503),
        httpx.Response(409, json={"error": "Duplicate"}),
        httpx.Response(200, headers={"content-length": "4"}),  # HEAD: same size stored
    )
    store(rec).put(DEAL_FILES, INBOX, b"%PDF", "application/pdf")
    assert [r.method for r in rec.requests] == ["POST", "POST", "HEAD"]


def test_get_request_shape():
    rec = Recorder(httpx.Response(200, content=b"%PDF"))
    assert store(rec).get(UPLOADS_STAGING, "u/abc.pdf") == b"%PDF"
    (req,) = rec.requests
    assert req.method == "GET"
    assert req.url.path == "/storage/v1/object/authenticated/uploads-staging/u/abc.pdf"
    _assert_auth(req)


def test_get_missing_raises_not_found():
    rec = Recorder(httpx.Response(400, json={"statusCode": "404", "error": "not_found"}))
    with pytest.raises(ObjectNotFoundError):
        store(rec).get(DEAL_FILES, INBOX)


def test_exists_and_info():
    rec = Recorder(httpx.Response(200, headers={"content-length": "12", "content-type": "a/b"}))
    info = store(rec).info(DEAL_FILES, INBOX)
    assert info.size == 12 and info.content_type == "a/b"
    assert rec.requests[0].method == "HEAD"
    assert rec.requests[0].url.path == f"/storage/v1/object/authenticated/deal-files/{INBOX}"
    assert store(Recorder(httpx.Response(400))).exists(DEAL_FILES, INBOX) is False
    assert store(Recorder(httpx.Response(404))).exists(DEAL_FILES, INBOX) is False


def test_move_request_shape():
    rec = Recorder(httpx.Response(200, json={"message": "Successfully moved"}))
    store(rec).move(DEAL_FILES, INBOX, FILED)
    (req,) = rec.requests
    assert req.method == "POST" and req.url.path == "/storage/v1/object/move"
    assert json.loads(req.content) == {
        "bucketId": "deal-files",
        "sourceKey": INBOX,
        "destinationKey": FILED,
    }


def test_move_outside_inbox_refused_without_a_request():
    rec = Recorder(httpx.Response(200))
    with pytest.raises(StorageForbiddenOperation):
        store(rec).move(DEAL_FILES, FILED, f"deals/2026-0142/03 Disclosures/{DOC}.pdf")
    assert rec.requests == []


def test_signed_url_request_shape_and_download_name():
    rec = Recorder(
        httpx.Response(200, json={"signedURL": f"/object/sign/deal-files/{INBOX}?token=t0k"})
    )
    url = store(rec).signed_url(DEAL_FILES, INBOX, 60, "2026-11-20_Amendment_v2_OPERATIVE.pdf")
    (req,) = rec.requests
    assert req.method == "POST"
    assert req.url.path == f"/storage/v1/object/sign/deal-files/{INBOX}"
    assert json.loads(req.content) == {"expiresIn": 60}
    assert url == (
        f"{URL}/storage/v1/object/sign/deal-files/{INBOX}?token=t0k"
        "&download=2026-11-20_Amendment_v2_OPERATIVE.pdf"
    )


def test_signed_url_without_download_name_and_bad_expiry():
    rec = Recorder(httpx.Response(200, json={"signedURL": "/object/sign/deal-files/a.pdf?token=t"}))
    assert "download=" not in store(rec).signed_url(DEAL_FILES, "a.pdf", 60, None)
    with pytest.raises(ValueError):
        store(rec).signed_url(DEAL_FILES, "a.pdf", 0, None)


def test_signed_url_unexpected_body():
    with pytest.raises(StorageError):
        store(Recorder(httpx.Response(200, json={}))).signed_url(DEAL_FILES, "a.pdf", 60, None)


def test_remove_staging_request_shape():
    rec = Recorder(httpx.Response(200, json=[]))
    store(rec).remove_staging("u/abc.pdf")
    (req,) = rec.requests
    assert req.method == "DELETE" and req.url.path == "/storage/v1/object/uploads-staging"
    assert json.loads(req.content) == {"prefixes": ["u/abc.pdf"]}


def test_no_delete_on_deal_files_anywhere():
    fs = store(Recorder(httpx.Response(200)))
    for name in ("delete", "remove", "remove_deal_file"):
        assert not hasattr(fs, name)
        assert not hasattr(InMemoryFileStore(), name)
    import inspect

    import mara.storage.supabase as mod

    assert inspect.signature(SupabaseFileStore.remove_staging).parameters.keys() == {"self", "key"}
    assert '"DELETE", f"/object/{UPLOADS_STAGING}"' in inspect.getsource(mod)


def test_retries_5xx_with_backoff_then_succeeds():
    rec = Recorder(httpx.Response(502), httpx.Response(503), httpx.Response(200, content=b"ok"))
    fs = store(rec)
    assert fs.get(DEAL_FILES, INBOX) == b"ok"
    assert len(rec.requests) == 3 and fs.sleeps == [0.5, 1.0]


def test_retries_timeouts_then_gives_up():
    rec = Recorder(httpx.ReadTimeout("slow"))
    fs = store(rec, max_attempts=3)
    with pytest.raises(StorageUnavailableError):
        fs.get(DEAL_FILES, INBOX)
    assert len(rec.requests) == 3 and fs.sleeps == [0.5, 1.0]


def test_persistent_5xx_raises_unavailable():
    with pytest.raises(StorageUnavailableError, match="500"):
        store(Recorder(httpx.Response(500)), max_attempts=2).get(DEAL_FILES, INBOX)


def test_4xx_is_not_retried():
    rec = Recorder(httpx.Response(401, json={"error": "Unauthorized", "message": "bad jwt"}))
    with pytest.raises(StorageAuthError):
        store(rec).get(DEAL_FILES, INBOX)
    assert len(rec.requests) == 1


def test_error_messages_do_not_leak_the_key():
    rec = Recorder(httpx.Response(418, json={"message": "teapot"}))
    with pytest.raises(StorageError) as exc:
        store(rec).get(DEAL_FILES, INBOX)
    assert KEY not in str(exc.value)


def test_from_settings_names_missing_env():
    with pytest.raises(MissingSettingError, match="SUPABASE_URL"):
        SupabaseFileStore.from_settings(Settings(supabase_url=None))
    fs = SupabaseFileStore.from_settings(Settings(supabase_url=URL, supabase_service_role_key=KEY))
    assert fs.base == f"{URL}/storage/v1"
    fs.close()
