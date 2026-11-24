"""FileStore Protocol, typed errors and the shared key/bucket guards."""

from __future__ import annotations

import re
from typing import Literal, Protocol, runtime_checkable

from pydantic import BaseModel

Bucket = Literal["uploads-staging", "deal-files"]
UPLOADS_STAGING: Bucket = "uploads-staging"
DEAL_FILES: Bucket = "deal-files"
BUCKETS: tuple[str, ...] = (UPLOADS_STAGING, DEAL_FILES)

MAX_KEY_LEN = 1024
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
# deals/{deal_number}/_Inbox/{file}  ->  deals/{deal_number}/{subfolder}/{file}
_INBOX_RE = re.compile(r"^deals/(?P<deal>[^/]+)/_Inbox/(?P<name>[^/]+)$")
_FILED_RE = re.compile(r"^deals/(?P<deal>[^/]+)/(?P<sub>[^/]+)/(?P<name>[^/]+)$")


class StorageError(RuntimeError):
    """Base for every storage failure. Messages never include keys' file contents or secrets."""


class InvalidKeyError(StorageError, ValueError):
    pass


class ObjectNotFoundError(StorageError):
    pass


class ObjectExistsError(StorageError):
    pass


class StorageAuthError(StorageError):
    """401/403 from Storage: wrong or missing service-role key."""


class StorageUnavailableError(StorageError):
    """5xx or network failure that persisted through every retry."""


class StorageForbiddenOperation(StorageError):
    """A call the contract forbids (delete on deal-files, a non-Inbox move, unknown bucket)."""


class ObjectInfo(BaseModel):
    bucket: Bucket
    key: str
    size: int | None = None
    content_type: str | None = None


@runtime_checkable
class FileStore(Protocol):
    """docs/CONTRACTS.md §7. No delete on `deal-files`."""

    def put(self, bucket: Bucket, key: str, data: bytes, content_type: str) -> None: ...

    def get(self, bucket: Bucket, key: str) -> bytes: ...

    def move(self, bucket: Bucket, src: str, dst: str) -> None: ...

    def exists(self, bucket: Bucket, key: str) -> bool: ...

    def signed_url(
        self, bucket: Bucket, key: str, expires_s: int, download_name: str | None
    ) -> str: ...

    def remove_staging(self, key: str) -> None: ...

    def signed_upload_url(self, key: str) -> str:
        """URL the browser PUTs the file bytes to (uploads-staging only)."""
        ...


def check_bucket(bucket: str) -> Bucket:
    if bucket not in BUCKETS:
        raise StorageForbiddenOperation(f"unknown bucket {bucket!r}")
    return bucket  # type: ignore[return-value]


def check_key(key: str) -> str:
    if not isinstance(key, str) or not key:
        raise InvalidKeyError("object key must be a non-empty string")
    if len(key) > MAX_KEY_LEN:
        raise InvalidKeyError("object key is too long")
    if key.startswith("/") or key.endswith("/") or "\\" in key or _CONTROL.search(key):
        raise InvalidKeyError(f"invalid object key {key!r}")
    if any(part in ("", ".", "..") for part in key.split("/")):
        raise InvalidKeyError(f"invalid object key {key!r}")
    return key


def check_expires(expires_s: int) -> int:
    if not isinstance(expires_s, int) or not 1 <= expires_s <= 3600:
        raise ValueError("expires_s must be an int between 1 and 3600")
    return expires_s


def check_move(bucket: Bucket, src: str, dst: str) -> None:
    """In `deal-files` the only allowed move is `_Inbox` -> a subfolder of the same deal."""
    check_key(src)
    check_key(dst)
    if src == dst:
        raise StorageForbiddenOperation("move source and destination are the same")
    if bucket != DEAL_FILES:
        return
    s, d = _INBOX_RE.match(src), _FILED_RE.match(dst)
    if not s or not d or d["sub"] == "_Inbox" or s["deal"] != d["deal"]:
        raise StorageForbiddenOperation(
            "deal-files keys never change except one _Inbox -> subfolder move in the same deal"
        )
