"""SMS providers behind the SmsProvider interface.

Only mara.outbound.sender may import this module (tests/test_send_boundary.py enforces it).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from mara.settings import Settings, get_settings, require

log = logging.getLogger("mara.outbound")


class ProviderTransientError(Exception):
    """Network or 5xx: the message stays queued and the sweep retries."""


class ProviderPermanentError(Exception):
    """The provider rejected the message: mark it failed."""


@dataclass
class SendResult:
    provider_message_id: str | None = None


class SmsProvider(Protocol):
    def send(self, to_e164: str, body: str) -> SendResult: ...


class EgoSmsProvider:
    """EgoSMS JSON API (https://www.egosms.co). TODO(decision): confirm the request and
    response shape against EgoSMS's current docs before the first live send; the URL is
    configurable with EGOSMS_API_URL.

    POST {url}  {"method": "SendSms", "userdata": {"username", "password"},
                 "msgdata": [{"number", "message", "senderid", "priority"}]}
    -> {"Status": "OK", "MsgFollowUpUniqueCode": "..."} or {"Status": "Failed", "Cause": "..."}
    """

    def __init__(
        self,
        username: str,
        password: str,
        sender_id: str,
        api_url: str,
        *,
        client: httpx.Client | None = None,
    ) -> None:
        self.username, self.password, self.sender_id, self.api_url = (
            username,
            password,
            sender_id,
            api_url,
        )
        self._client = client or httpx.Client(timeout=httpx.Timeout(20.0, connect=10.0))

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> EgoSmsProvider:
        s = settings or get_settings()
        return cls(
            require(s.egosms_username, "EGOSMS_USERNAME"),
            require(s.egosms_password, "EGOSMS_PASSWORD"),
            require(s.egosms_sender_id, "EGOSMS_SENDER_ID"),
            s.egosms_api_url,
        )

    def send(self, to_e164: str, body: str) -> SendResult:
        payload = {
            "method": "SendSms",
            "userdata": {"username": self.username, "password": self.password},
            "msgdata": [
                {
                    "number": to_e164.lstrip("+"),
                    "message": body,
                    "senderid": self.sender_id,
                    "priority": "0",
                }
            ],
        }
        try:
            resp = self._client.post(self.api_url, json=payload)
        except httpx.HTTPError as exc:
            raise ProviderTransientError(f"EgoSMS request failed: {type(exc).__name__}") from exc
        if resp.status_code >= 500 or resp.status_code == 429:
            raise ProviderTransientError(f"EgoSMS returned {resp.status_code}")
        if resp.status_code >= 400:
            raise ProviderPermanentError(f"EgoSMS returned {resp.status_code}")
        try:
            data = resp.json()
        except ValueError as exc:
            raise ProviderTransientError("EgoSMS returned a non-JSON response") from exc
        if str(data.get("Status", "")).upper() != "OK":
            # Never echo credentials; the cause text is the provider's own.
            raise ProviderPermanentError(f"EgoSMS rejected the message: {data.get('Cause', '?')}")
        return SendResult(str(data.get("MsgFollowUpUniqueCode") or "") or None)


@dataclass
class FakeSmsProvider:
    """Records sends; never touches the network."""

    sent: list[tuple[str, str]] = field(default_factory=list)
    error: Exception | None = None

    def send(self, to_e164: str, body: str) -> SendResult:
        if self.error:
            raise self.error
        self.sent.append((to_e164, body))
        return SendResult(f"fake-{len(self.sent)}")
