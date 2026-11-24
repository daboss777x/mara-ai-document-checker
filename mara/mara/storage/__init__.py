"""File storage (Supabase Storage). docs/CONTRACTS.md §7, BUILD_PLAN §5.

Postgres is the source of truth; files are referenced by their object key
(`documents.file_path` in `deal-files`, `documents.storage_path` in `uploads-staging`).
There is no delete on `deal-files` anywhere: superseded files stay in place.
"""

from mara.storage.base import (
    DEAL_FILES,
    UPLOADS_STAGING,
    Bucket,
    FileStore,
    InvalidKeyError,
    ObjectExistsError,
    ObjectInfo,
    ObjectNotFoundError,
    StorageAuthError,
    StorageError,
    StorageForbiddenOperation,
    StorageUnavailableError,
)
from mara.storage.keys import (
    INBOX_SUBFOLDER,
    deal_file_key,
    download_name,
    inbox_key,
    template_key,
)
from mara.storage.memory import InMemoryFileStore
from mara.storage.supabase import SupabaseFileStore, get_file_store

__all__ = [
    "DEAL_FILES",
    "INBOX_SUBFOLDER",
    "UPLOADS_STAGING",
    "Bucket",
    "FileStore",
    "InMemoryFileStore",
    "InvalidKeyError",
    "ObjectExistsError",
    "ObjectInfo",
    "ObjectNotFoundError",
    "StorageAuthError",
    "StorageError",
    "StorageForbiddenOperation",
    "StorageUnavailableError",
    "SupabaseFileStore",
    "deal_file_key",
    "download_name",
    "get_file_store",
    "inbox_key",
    "template_key",
]
