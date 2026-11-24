"""In-memory FileStore for tests. Same rules as the Supabase adapter."""

from __future__ import annotations

from urllib.parse import quote

from mara.storage.base import (
    UPLOADS_STAGING,
    Bucket,
    ObjectExistsError,
    ObjectInfo,
    ObjectNotFoundError,
    check_bucket,
    check_expires,
    check_key,
    check_move,
)


class InMemoryFileStore:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], tuple[bytes, str]] = {}

    def put(self, bucket: Bucket, key: str, data: bytes, content_type: str) -> None:
        bucket, key = check_bucket(bucket), check_key(key)
        if not isinstance(data, bytes | bytearray):
            raise TypeError("data must be bytes")
        if (bucket, key) in self.objects:
            raise ObjectExistsError(f"{bucket}/{key} already exists")
        self.objects[(bucket, key)] = (bytes(data), content_type)

    def get(self, bucket: Bucket, key: str) -> bytes:
        try:
            return self.objects[(check_bucket(bucket), check_key(key))][0]
        except KeyError:
            raise ObjectNotFoundError(f"{bucket}/{key} not found") from None

    def info(self, bucket: Bucket, key: str) -> ObjectInfo | None:
        obj = self.objects.get((check_bucket(bucket), check_key(key)))
        if obj is None:
            return None
        return ObjectInfo(bucket=bucket, key=key, size=len(obj[0]), content_type=obj[1])

    def exists(self, bucket: Bucket, key: str) -> bool:
        return self.info(bucket, key) is not None

    def move(self, bucket: Bucket, src: str, dst: str) -> None:
        bucket = check_bucket(bucket)
        check_move(bucket, src, dst)
        if (bucket, src) not in self.objects:
            raise ObjectNotFoundError(f"{bucket}/{src} not found")
        if (bucket, dst) in self.objects:
            raise ObjectExistsError(f"{bucket}/{dst} already exists")
        self.objects[(bucket, dst)] = self.objects.pop((bucket, src))

    def signed_url(
        self, bucket: Bucket, key: str, expires_s: int, download_name: str | None
    ) -> str:
        bucket, key = check_bucket(bucket), check_key(key)
        check_expires(expires_s)
        if (bucket, key) not in self.objects:
            raise ObjectNotFoundError(f"{bucket}/{key} not found")
        url = f"memory://{bucket}/{quote(key)}?expires={expires_s}"
        return url + (f"&download={quote(download_name)}" if download_name else "")

    def remove_staging(self, key: str) -> None:
        self.objects.pop((UPLOADS_STAGING, check_key(key)), None)

    def signed_upload_url(self, key: str) -> str:
        return f"memory://{UPLOADS_STAGING}/{quote(check_key(key))}?upload=1"
