"""Code-level outbound content filter (CLAUDE.md rule 2).

Runs on every SMS body in send_message(), whoever wrote it (a template, Mara or the
agent's fix note). Blocks banking/wiring details and legal or financial advice phrasing.
It is deliberately blunt: a blocked message goes back to a human, never to the client.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_I = re.IGNORECASE

_BANKING = [
    r"\bwir(?:e|ed|es|ing)\b",
    r"\brouting\s*(?:number|no\b|#)",
    r"\baccount\s*(?:number|no\b|#)",
    r"\bbank\s+account\b",
    r"\b(?:iban|swift|bic)\b",
    r"\bach\b",
    r"\bsend\s+(?:the\s+|your\s+)?(?:funds|money|payment|deposit)\b",
    r"\btransfer\s+(?:the\s+|your\s+)?(?:funds|money|payment|deposit)\b",
    r"\b\d{9,17}\b",  # a bare run of digits looks like a routing or account number
]
_ADVICE = [
    r"\blegal(?:ly)?\s+(?:advice|binding|obligat\w*|liab\w*)",
    r"\bfinancial\s+advice\b",
    r"\b(?:you\s+should|you\s+must|you\s+need\s+to|i\s+(?:recommend|advise)|we\s+(?:recommend|advise))"
    r"\s+(?:\w+\s+){0,2}(?:sign|waive|accept|reject|counter|negotiate|offer|invest|refinance|sue)\b",
    r"\bnegotiat\w+\b",
    r"\bsue\b|\blawsuit\b",
    r"\b(?:is|are)\s+(?:a\s+)?(?:good|bad|fair|unfair)\s+(?:deal|price|rate|offer)\b",
]


@dataclass(frozen=True)
class FilterResult:
    blocked: bool
    reason: str | None = None


def check_outbound(body: str) -> FilterResult:
    body = re.sub(r"https?://\S+", " ", body)  # portal links hold random tokens, not numbers
    for pat in _BANKING:
        if re.search(pat, body, _I):
            return FilterResult(True, "banking_or_wiring_details")
    for pat in _ADVICE:
        if re.search(pat, body, _I):
            return FilterResult(True, "legal_or_financial_advice")
    return FilterResult(False)
