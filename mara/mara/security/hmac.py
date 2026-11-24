"""X-Mara-Signature (docs/CONTRACTS.md §1).

Header: ``t=<unix_seconds>,v1=<hex>`` where
``v1 = hex(HMAC_SHA256(secret, "<t>.<raw body bytes>"))``.
"""

from __future__ import annotations

import hashlib
import hmac as _hmac
import time

HEADER_NAME = "X-Mara-Signature"
DEFAULT_TOLERANCE = 300


def _digest(secret: str | bytes, body: bytes, t: int) -> str:
    key = secret.encode() if isinstance(secret, str) else secret
    msg = f"{t}.".encode() + body
    return _hmac.new(key, msg, hashlib.sha256).hexdigest()


def sign(secret: str | bytes, body: bytes, t: int | None = None) -> str:
    """Return a full header value for ``body`` signed at time ``t`` (default: now)."""
    t = int(time.time()) if t is None else int(t)
    return f"t={t},v1={_digest(secret, body, t)}"


def _parse(header: str) -> tuple[int, list[str]] | None:
    t: int | None = None
    sigs: list[str] = []
    for part in header.split(","):
        key, sep, value = part.strip().partition("=")
        if not sep or not value:
            return None
        if key == "t":
            if not value.isdigit():
                return None
            t = int(value)
        elif key == "v1":
            sigs.append(value)
    if t is None or not sigs:
        return None
    return t, sigs


def verify(
    secret: str | bytes | None,
    header: str | None,
    body: bytes,
    now: int | None = None,
    tolerance: int = DEFAULT_TOLERANCE,
) -> bool:
    """True only if the header is well formed, fresh and matches. Never raises."""
    if not secret or not header:
        return False
    parsed = _parse(header)
    if parsed is None:
        return False
    t, sigs = parsed
    now = int(time.time()) if now is None else int(now)
    if abs(now - t) > tolerance:
        return False
    expected = _digest(secret, body, t)
    # Check every v1 (allows secret rotation later) without short-circuiting on match.
    ok = False
    for sig in sigs:
        ok |= _hmac.compare_digest(expected, sig.lower())
    return ok
