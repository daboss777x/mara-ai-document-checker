"""Token, session and code helpers. Only hashes are stored; raw values go to the client."""

from __future__ import annotations

import hashlib
import hmac
import secrets


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_token() -> str:
    """Portal link token / device session token (URL-safe, 256-bit)."""
    return secrets.token_urlsafe(32)


def new_code() -> str:
    """Six-digit verification code."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    """Codes are hashed like tokens and sessions: lowercase hex sha256 (docs/CONTRACTS.md)."""
    return sha256_hex(code)


def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
