"""Object-key and download-name helpers. docs/CONTRACTS.md §7, BUILD_PLAN §5."""

from __future__ import annotations

import re
from datetime import date as Date
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from mara.storage.base import check_key

INBOX_SUBFOLDER = "_Inbox"
_DEAL_NUMBER = r"^[A-Za-z0-9][A-Za-z0-9-]{0,31}$"
_EXT = r"^[a-z0-9]{1,10}$"
_UNSAFE_SEGMENT = re.compile(r"[/\\\x00-\x1f\x7f]")


def _norm_ext(v: str) -> str:
    return v.strip().lstrip(".").lower() if isinstance(v, str) else v


class _KeyInput(BaseModel):
    deal_number: str = Field(pattern=_DEAL_NUMBER)
    document_id: UUID
    ext: str = Field(pattern=_EXT)

    _ext = field_validator("ext", mode="before")(_norm_ext)


class _FiledKeyInput(_KeyInput):
    # The subfolder comes from document_types.subfolder (config in the DB, not a list here).
    subfolder: str = Field(min_length=1, max_length=100)

    @field_validator("subfolder")
    @classmethod
    def _safe_segment(cls, v: str) -> str:
        if v != v.strip() or v in (".", "..", INBOX_SUBFOLDER) or _UNSAFE_SEGMENT.search(v):
            raise ValueError("subfolder must be a single safe path segment (not _Inbox)")
        return v


def deal_file_key(deal_number: str, subfolder: str, document_id: UUID | str, ext: str) -> str:
    """`deals/{deal_number}/{subfolder}/{document_id}.{ext}` (the documents.file_path)."""
    m = _FiledKeyInput(
        deal_number=deal_number, subfolder=subfolder, document_id=document_id, ext=ext
    )
    return check_key(f"deals/{m.deal_number}/{m.subfolder}/{m.document_id}.{m.ext}")


def inbox_key(deal_number: str, document_id: UUID | str, ext: str) -> str:
    """`deals/{deal_number}/_Inbox/{document_id}.{ext}` for files not yet classified."""
    m = _KeyInput(deal_number=deal_number, document_id=document_id, ext=ext)
    return check_key(f"deals/{m.deal_number}/{INBOX_SUBFOLDER}/{m.document_id}.{m.ext}")


class _TemplateKeyInput(BaseModel):
    key: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


def template_key(key: str) -> str:
    """`_templates/{key}.docx` (templates.body_or_file_path)."""
    return check_key(f"_templates/{_TemplateKeyInput(key=key).key}.docx")


class _DownloadNameInput(BaseModel):
    date: Date
    doc_type_key: str = Field(min_length=1, max_length=80)
    version: int = Field(ge=1)
    status: str = Field(min_length=1, max_length=40)
    ext: str = Field(pattern=_EXT)

    _ext = field_validator("ext", mode="before")(_norm_ext)


def _pascal(value: str) -> str:
    parts = [p for p in re.split(r"[\s_]+", value) if p]
    cleaned = "".join(p[:1].upper() + p[1:] for p in parts)
    return re.sub(r"[^A-Za-z0-9-]", "", cleaned)


def download_name(date: Date | str, doc_type_key: str, version: int, status: str, ext: str) -> str:
    """`{YYYY-MM-DD}_{DocTypeKey}_v{n}_{STATUS}.{ext}`.

    e.g. `2026-11-20_Amendment_v2_OPERATIVE.pdf`.

    Set on the signed URL, so superseding a document never renames an object.
    """
    m = _DownloadNameInput(
        date=date, doc_type_key=doc_type_key, version=version, status=status, ext=ext
    )
    type_part = _pascal(m.doc_type_key)
    status_part = re.sub(r"[^A-Z0-9]", "", m.status.upper())
    if not type_part or not status_part:
        raise ValueError("doc_type_key and status must contain letters or digits")
    return f"{m.date.isoformat()}_{type_part}_v{m.version}_{status_part}.{m.ext}"
