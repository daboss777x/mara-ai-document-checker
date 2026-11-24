"""Turn uploaded bytes into something the checker can read (PDF, DOCX, JPG, PNG)."""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from typing import Literal

PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
JPEG = "image/jpeg"
PNG = "image/png"
ALLOWED_MIME: dict[str, str] = {PDF: "pdf", DOCX: "docx", JPEG: "jpg", PNG: "png"}
MAX_BYTES = 25 * 1024 * 1024


class UnreadableFile(Exception):  # noqa: N818
    """The file can't be opened or doesn't match its declared type."""


@dataclass
class DocumentInput:
    kind: Literal["pdf", "image", "text"]
    media_type: str
    page_count: int | None
    data: bytes | None = None
    text: str | None = None


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ext_for(mime: str) -> str:
    try:
        return ALLOWED_MIME[mime]
    except KeyError:
        raise UnreadableFile(f"unsupported file type {mime!r}") from None


def _sniff_ok(mime: str, data: bytes) -> bool:
    if mime == PDF:
        return data.lstrip()[:5] == b"%PDF-"
    if mime == PNG:
        return data[:8] == b"\x89PNG\r\n\x1a\n"
    if mime == JPEG:
        return data[:3] == b"\xff\xd8\xff"
    if mime == DOCX:
        return data[:2] == b"PK"
    return False


def prepare(data: bytes, mime: str) -> DocumentInput:
    ext_for(mime)
    if not data:
        raise UnreadableFile("file is empty")
    if len(data) > MAX_BYTES:
        raise UnreadableFile("file is larger than 25 MB")
    if not _sniff_ok(mime, data):
        raise UnreadableFile("file contents don't match the declared type")
    if mime == PDF:
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                raise UnreadableFile("PDF is password protected")
            pages = len(reader.pages)
        except UnreadableFile:
            raise
        except Exception as exc:
            raise UnreadableFile(f"could not open PDF: {exc.__class__.__name__}") from exc
        if pages < 1:
            raise UnreadableFile("PDF has no pages")
        return DocumentInput("pdf", PDF, pages, data=data)
    if mime in (JPEG, PNG):
        return DocumentInput("image", mime, 1, data=data)
    from docx import Document

    try:
        doc = Document(io.BytesIO(data))
    except Exception as exc:
        raise UnreadableFile(f"could not open DOCX: {exc.__class__.__name__}") from exc
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            parts.append(" | ".join(c.text.strip() for c in row.cells))
    text = "\n".join(parts)
    if not text.strip():
        raise UnreadableFile("DOCX has no readable text")
    return DocumentInput("text", DOCX, None, text=text)
