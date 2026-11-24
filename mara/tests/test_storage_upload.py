import httpx
import pytest

from mara.storage import InMemoryFileStore, StorageError, SupabaseFileStore


def test_in_memory_signed_upload_url():
    url = InMemoryFileStore().signed_upload_url("deals/2026-0142/sales_contract/x.pdf")
    assert url.startswith("memory://uploads-staging/deals/")


def store(handler):
    return SupabaseFileStore(
        "https://x.supabase.co", "svc", transport=httpx.MockTransport(handler), max_attempts=1
    )


def test_supabase_signed_upload_url_request_and_result():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["method"], seen["path"] = req.method, req.url.path
        return httpx.Response(
            200, json={"url": "/object/upload/sign/uploads-staging/a/b.pdf?token=t"}
        )

    url = store(handler).signed_upload_url("a/b.pdf")
    assert seen == {
        "method": "POST",
        "path": "/storage/v1/object/upload/sign/uploads-staging/a/b.pdf",
    }
    assert (
        url == "https://x.supabase.co/storage/v1/object/upload/sign/uploads-staging/a/b.pdf?token=t"
    )


def test_supabase_signed_upload_url_bad_response():
    with pytest.raises(StorageError):
        store(lambda r: httpx.Response(200, json={"nope": 1})).signed_upload_url("a/b.pdf")
