"""Supabase Storage adapter (REST API over httpx, service-role key).

Endpoints used (all under {SUPABASE_URL}/storage/v1):
  POST   /object/{bucket}/{key}        upload (x-upsert: false)
  GET    /object/{bucket}/{key}        download (authenticated)
  HEAD   /object/{bucket}/{key}        exists / info
  POST   /object/move                  {bucketId, sourceKey, destinationKey}
  POST   /object/sign/{bucket}/{key}   {expiresIn} -> {signedURL}
  DELETE /object/uploads-staging       {prefixes: [key]}  (staging only)

5xx responses, timeouts and network errors are retried with exponential backoff.
Every other failure raises a typed StorageError.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from urllib.parse import quote

import httpx

from mara.settings import Settings, get_settings, require
from mara.storage.base import (
    UPLOADS_STAGING,
    Bucket,
    ObjectExistsError,
    ObjectInfo,
    ObjectNotFoundError,
    StorageAuthError,
    StorageError,
    StorageUnavailableError,
    check_bucket,
    check_expires,
    check_key,
    check_move,
)

log = logging.getLogger("mara.storage")

DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


def _path(bucket: str, key: str) -> str:
    return f"{quote(bucket, safe='')}/{quote(key, safe='/')}"


def _error_text(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        return resp.text[:200]
    if isinstance(body, dict):
        return " ".join(
            str(body[k]) for k in ("statusCode", "error", "message") if body.get(k) is not None
        )
    return str(body)[:200]


class SupabaseFileStore:
    def __init__(
        self,
        url: str,
        service_role_key: str,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout: httpx.Timeout | float = DEFAULT_TIMEOUT,
        max_attempts: int = 4,
        backoff_s: float = 0.5,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not url or not service_role_key:
            raise ValueError("SupabaseFileStore needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        self.base = url.rstrip("/") + "/storage/v1"
        self.max_attempts = max(1, max_attempts)
        self.backoff_s = backoff_s
        self._sleep = sleep
        self._client = httpx.Client(
            base_url=self.base,
            transport=transport,
            timeout=timeout,
            headers={"Authorization": f"Bearer {service_role_key}", "apikey": service_role_key},
        )

    @classmethod
    def from_settings(cls, settings: Settings | None = None, **kwargs) -> SupabaseFileStore:
        settings = settings or get_settings()
        return cls(
            require(settings.supabase_url, "SUPABASE_URL"),
            require(settings.supabase_service_role_key, "SUPABASE_SERVICE_ROLE_KEY"),
            **kwargs,
        )

    def close(self) -> None:
        self._client.close()

    # --- transport -----------------------------------------------------------------

    def _send(self, method: str, url: str, **kwargs) -> tuple[httpx.Response, bool]:
        """Send with retries. Returns (response, retried_after_ambiguous_failure)."""
        ambiguous = False
        for attempt in range(1, self.max_attempts + 1):
            try:
                resp = self._client.request(method, url, **kwargs)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                if attempt == self.max_attempts:
                    raise StorageUnavailableError(
                        f"storage {method} failed after {attempt} attempts: {type(exc).__name__}"
                    ) from exc
                log.warning("storage %s %s: %s, retrying", method, url, type(exc).__name__)
                ambiguous = True
            else:
                if resp.status_code < 500:
                    return resp, ambiguous
                if attempt == self.max_attempts:
                    raise StorageUnavailableError(
                        f"storage {method} returned {resp.status_code} after {attempt} attempts"
                    )
                log.warning("storage %s %s: %s, retrying", method, url, resp.status_code)
                ambiguous = True
            self._sleep(self.backoff_s * 2 ** (attempt - 1))
        raise AssertionError("unreachable")  # pragma: no cover

    @staticmethod
    def _raise_for(resp: httpx.Response, what: str) -> None:
        if resp.is_success:
            return
        text = _error_text(resp)
        low = text.lower()
        status = resp.status_code
        if status in (401, 403) and "not found" not in low:
            raise StorageAuthError(f"{what}: {status} {text}")
        if status == 404 or "not found" in low or "not_found" in low:
            raise ObjectNotFoundError(f"{what}: not found")
        if status == 409 or "duplicate" in low or "already exists" in low:
            raise ObjectExistsError(f"{what}: already exists")
        raise StorageError(f"{what}: {status} {text}")

    # --- FileStore -----------------------------------------------------------------

    def put(self, bucket: Bucket, key: str, data: bytes, content_type: str) -> None:
        bucket, key = check_bucket(bucket), check_key(key)
        if not isinstance(data, bytes | bytearray):
            raise TypeError("data must be bytes")
        resp, ambiguous = self._send(
            "POST",
            f"/object/{_path(bucket, key)}",
            content=bytes(data),
            headers={"Content-Type": content_type, "x-upsert": "false"},
        )
        try:
            self._raise_for(resp, f"put {bucket}/{key}")
        except ObjectExistsError:
            # An earlier attempt may have landed before timing out. Same size = same upload.
            info = self.info(bucket, key) if ambiguous else None
            if info is not None and info.size == len(data):
                log.info("put %s/%s: already stored by an earlier attempt", bucket, key)
                return
            raise

    def get(self, bucket: Bucket, key: str) -> bytes:
        bucket, key = check_bucket(bucket), check_key(key)
        resp, _ = self._send("GET", f"/object/authenticated/{_path(bucket, key)}")
        self._raise_for(resp, f"get {bucket}/{key}")
        return resp.content

    def info(self, bucket: Bucket, key: str) -> ObjectInfo | None:
        bucket, key = check_bucket(bucket), check_key(key)
        resp, _ = self._send("HEAD", f"/object/authenticated/{_path(bucket, key)}")
        # HEAD has no body; Storage answers 400 or 404 for a missing object.
        if resp.status_code in (400, 404):
            return None
        self._raise_for(resp, f"info {bucket}/{key}")
        size = resp.headers.get("content-length")
        return ObjectInfo(
            bucket=bucket,
            key=key,
            size=int(size) if size and size.isdigit() else None,
            content_type=resp.headers.get("content-type"),
        )

    def exists(self, bucket: Bucket, key: str) -> bool:
        return self.info(bucket, key) is not None

    def move(self, bucket: Bucket, src: str, dst: str) -> None:
        bucket = check_bucket(bucket)
        check_move(bucket, src, dst)
        resp, ambiguous = self._send(
            "POST",
            "/object/move",
            json={"bucketId": bucket, "sourceKey": src, "destinationKey": dst},
        )
        try:
            self._raise_for(resp, f"move {bucket}/{src}")
        except (ObjectNotFoundError, ObjectExistsError):
            # Retried after a lost response: the move may already have happened.
            if ambiguous and self.exists(bucket, dst) and not self.exists(bucket, src):
                return
            raise

    def signed_url(
        self, bucket: Bucket, key: str, expires_s: int, download_name: str | None
    ) -> str:
        bucket, key = check_bucket(bucket), check_key(key)
        check_expires(expires_s)
        resp, _ = self._send(
            "POST", f"/object/sign/{_path(bucket, key)}", json={"expiresIn": expires_s}
        )
        self._raise_for(resp, f"sign {bucket}/{key}")
        try:
            signed = resp.json()["signedURL"]
        except (ValueError, KeyError, TypeError) as exc:
            raise StorageError(f"sign {bucket}/{key}: unexpected response") from exc
        url = f"{self.base}{signed}"
        if download_name:
            url += ("&" if "?" in url else "?") + "download=" + quote(download_name, safe="")
        return url

    def remove_staging(self, key: str) -> None:
        key = check_key(key)
        resp, _ = self._send("DELETE", f"/object/{UPLOADS_STAGING}", json={"prefixes": [key]})
        self._raise_for(resp, f"remove {UPLOADS_STAGING}/{key}")

    def signed_upload_url(self, key: str) -> str:
        """Signed upload URL into uploads-staging (the browser PUTs the bytes to it)."""
        key = check_key(key)
        resp, _ = self._send(
            "POST",
            f"/object/upload/sign/{_path(UPLOADS_STAGING, key)}",
            headers={"x-upsert": "false"},
        )
        self._raise_for(resp, f"sign upload {UPLOADS_STAGING}/{key}")
        try:
            rel = resp.json()["url"]
        except (ValueError, KeyError, TypeError) as exc:
            raise StorageError(f"sign upload {UPLOADS_STAGING}/{key}: unexpected response") from exc
        return rel if rel.startswith("http") else f"{self.base}{rel}"


def get_file_store(settings: Settings | None = None) -> SupabaseFileStore:
    """The deployed FileStore. Raises MissingSettingError naming the missing env var."""
    return SupabaseFileStore.from_settings(settings)
