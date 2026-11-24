"""Document checker: a standard + a document -> findings.

`Checker` is the model seam (ClaudeChecker in production, FakeChecker in tests and
evals). `evaluate()` is pure: it turns the model's per-rule checks into findings and
enforces the confidence rules in code, so a model that is too generous can't slip a
signature through (docs/CONTRACTS.md §4 step 4).
"""

from __future__ import annotations

import base64
import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Literal, Protocol

from pydantic import BaseModel, Field, field_validator

from mara.config import Rule, Standard, prompts_dir
from mara.documents import DocumentInput
from mara.settings import Settings, get_settings, require

SIGNATURE_MIN_CONFIDENCE = 0.9  # a signature never "passes" below this
# Initials are tiny marks: the model rates even clear ones around 0.88. A missing initial still
# comes back as "fail". TODO(decision): Enoch to confirm 0.85 (set 2026-11-24 from live evals).
INITIALS_MIN_CONFIDENCE = 0.85
OTHER_MIN_CONFIDENCE = 0.5
PURPOSE = "check_document"


class UnreadableDocument(Exception):  # noqa: N818
    """The checker could not read the document (blurry, blank, damaged, refused)."""


class CheckerError(Exception):
    """The model call failed. process_document turns this into the failure path."""


# --- model output ------------------------------------------------------------------


class CheckItem(BaseModel):
    rule_key: str
    result: Literal["pass", "fail", "unsure"]
    confidence: float = 0.0
    page: int | None = None
    quote: str | None = None
    note: str = ""

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp(cls, v):
        try:
            return min(max(float(v), 0.0), 1.0)
        except (TypeError, ValueError):
            return 0.0

    @field_validator("page", mode="before")
    @classmethod
    def _page(cls, v):
        return v if isinstance(v, int) and v >= 1 else None


class ModelOutput(BaseModel):
    summary: str
    readable: bool = True
    document_matches_type: bool = True
    checks: list[CheckItem] = Field(default_factory=list)


class Finding(BaseModel):
    rule_key: str
    severity: Literal["blocker", "warning"]
    message: str
    client_fix_text: str
    page: int | None = None
    quote: str | None = None


@dataclass
class ModelCall:
    output: ModelOutput
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None


class CheckResult(BaseModel):
    summary: str
    findings: list[Finding]
    model: str
    prompt_version: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    output_json: dict


@dataclass(frozen=True)
class CheckContext:
    """Facts about the deal the model can't see in the document itself."""

    today: date
    client_name: str | None = None


class Checker(Protocol):
    model: str

    def check(
        self,
        standard: Standard,
        doc_type_name: str,
        doc_type_description: str,
        doc: DocumentInput,
        context: CheckContext | None = None,
    ) -> ModelCall: ...


# --- prompt ------------------------------------------------------------------------

_FRONT = re.compile(r"\A---\n(.*?)\n---\n", re.S)


def load_prompt(name: str = "check_document") -> tuple[str, str]:
    """Return (body, version) from prompts/<name>.md. Version comes from the header."""
    import yaml

    raw = (prompts_dir() / f"{name}.md").read_text(encoding="utf-8")
    m = _FRONT.match(raw)
    if not m:
        raise ValueError(f"prompt {name} has no version header")
    meta = yaml.safe_load(m.group(1))
    return raw[m.end() :].strip(), f"{meta['name']}@v{meta['version']}"


def render_rules(standard: Standard) -> str:
    lines = []
    for rule, cat in standard.rules():
        lines.append(f"- `{rule.key}` [{cat}, {rule.severity}]: {rule.description}")
    return "\n".join(lines)


def build_system_prompt(
    standard: Standard, name: str, description: str, context: CheckContext | None = None
) -> tuple[str, str]:
    body, version = load_prompt()
    ctx = context or CheckContext(today=datetime.now(UTC).date())
    values = {
        "document_type_name": name,
        "document_type_description": description,
        "rules": render_rules(standard),
        "today": ctx.today.isoformat(),
        "client_name": ctx.client_name or "not known",
    }
    for k, v in values.items():
        body = body.replace("{{" + k + "}}", v)
    return body, version


OUTPUT_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "readable": {"type": "boolean"},
        "document_matches_type": {"type": "boolean"},
        "checks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rule_key": {"type": "string"},
                    "result": {"type": "string", "enum": ["pass", "fail", "unsure"]},
                    "confidence": {"type": "number"},
                    "page": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                    "quote": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "note": {"type": "string"},
                },
                "required": ["rule_key", "result", "confidence", "page", "quote", "note"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "readable", "document_matches_type", "checks"],
    "additionalProperties": False,
}

# $ per million tokens (input, output). Unknown models record cost_usd = null.
PRICES = {"claude-opus-5-5": (4.0, 20.0), "claude-sonnet-5-5": (2.0, 10.0)}


def cost_usd(model: str, input_tokens: int | None, output_tokens: int | None) -> float | None:
    if model not in PRICES or input_tokens is None or output_tokens is None:
        return None
    p_in, p_out = PRICES[model]
    return round((input_tokens * p_in + output_tokens * p_out) / 1_000_000, 6)


# --- evaluation (pure) -------------------------------------------------------------


def _finding(rule: Rule, severity: str, message: str, c: CheckItem | None) -> Finding:
    return Finding(
        rule_key=rule.key,
        severity=severity,  # type: ignore[arg-type]
        message=message,
        client_fix_text=rule.client_fix_text,
        page=c.page if c else None,
        quote=c.quote if c else None,
    )


def evaluate(standard: Standard, out: ModelOutput) -> tuple[str, list[Finding]]:
    """Per-rule checks -> (summary, findings). Raises UnreadableDocument if unreadable."""
    if not out.readable:
        raise UnreadableDocument(out.summary or "document is not readable")
    if not out.document_matches_type:
        return out.summary, [
            Finding(
                rule_key="wrong_document",
                severity="blocker",
                message="This doesn't look like the document that was asked for.",
                client_fix_text=(
                    f"This doesn't look like the {standard.name.lower()}. "
                    "Please upload the right document."
                ),
            )
        ]
    by_key = {c.rule_key: c for c in out.checks}
    findings: list[Finding] = []
    for rule, cat in standard.rules():
        c = by_key.get(rule.key)
        floor = {
            "signature": SIGNATURE_MIN_CONFIDENCE,
            "initials": INITIALS_MIN_CONFIDENCE,
        }.get(cat, OTHER_MIN_CONFIDENCE)
        if c is None:
            findings.append(
                _finding(rule, "warning", f"Mara didn't check this rule: {rule.description}", None)
            )
        elif c.result == "fail":
            msg = c.note or f"Not met: {rule.description}"
            findings.append(_finding(rule, rule.severity, msg, c))
        elif c.result == "unsure" or c.confidence < floor:
            why = c.note or rule.description
            findings.append(_finding(rule, "warning", f"Mara isn't sure: {why}", c))
    return out.summary, findings


def run_check(
    checker: Checker,
    standard: Standard,
    doc_type_name: str,
    doc_type_description: str,
    doc: DocumentInput,
    prompt_version: str | None = None,
    context: CheckContext | None = None,
) -> CheckResult:
    call = checker.check(standard, doc_type_name, doc_type_description, doc, context)
    summary, findings = evaluate(standard, call.output)
    return CheckResult(
        summary=summary,
        findings=findings,
        model=call.model,
        prompt_version=prompt_version or getattr(checker, "prompt_version", "fake@v0"),
        input_tokens=call.input_tokens,
        output_tokens=call.output_tokens,
        cost_usd=call.cost_usd,
        output_json=call.output.model_dump(),
    )


# --- checkers ----------------------------------------------------------------------


class ClaudeChecker:
    """Calls Claude with the document attached (PDF/image block, or DOCX text)."""

    def __init__(self, settings: Settings | None = None, client=None) -> None:
        self.settings = settings or get_settings()
        self.model = self.settings.mara_check_model
        self.prompt_version = "check-document"
        self._client = client

    def _get_client(self):
        if self._client is None:
            import anthropic

            key = require(self.settings.anthropic_api_key, "ANTHROPIC_API_KEY")
            self._client = anthropic.Anthropic(api_key=key, timeout=300.0)
        return self._client

    def check(self, standard, doc_type_name, doc_type_description, doc, context=None) -> ModelCall:
        system, version = build_system_prompt(
            standard, doc_type_name, doc_type_description, context
        )
        self.prompt_version = version
        if doc.kind == "pdf":
            block = {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.standard_b64encode(doc.data or b"").decode("ascii"),
                },
            }
        elif doc.kind == "image":
            block = {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": doc.media_type,
                    "data": base64.standard_b64encode(doc.data or b"").decode("ascii"),
                },
            }
        else:
            block = {"type": "text", "text": f"<document>\n{doc.text}\n</document>"}
        try:
            resp = self._get_client().messages.create(
                model=self.model,
                max_tokens=8000,
                system=system,
                messages=[
                    {
                        "role": "user",
                        "content": [block, {"type": "text", "text": "Check this document."}],
                    }
                ],
                output_config={
                    "effort": "medium",
                    "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
                },
            )
        except Exception as exc:  # network, auth, rate limit: the failure path handles it
            raise CheckerError(f"model call failed: {exc.__class__.__name__}") from exc
        if resp.stop_reason == "refusal":
            raise UnreadableDocument("the model declined to read this document")
        if resp.stop_reason == "max_tokens":
            raise CheckerError("model output was cut off")
        text = next((b.text for b in resp.content if b.type == "text"), None)
        if text is None:
            raise CheckerError("model returned no text")
        try:
            output = ModelOutput.model_validate(json.loads(text))
        except ValueError as exc:
            raise CheckerError("model returned invalid JSON") from exc
        i, o = resp.usage.input_tokens, resp.usage.output_tokens
        return ModelCall(output, self.model, i, o, cost_usd(self.model, i, o))


class FakeChecker:
    """Deterministic checker for tests and evals. No network.

    `responder` maps (standard, doc) -> ModelOutput, or pass a fixed ModelOutput.
    Set `raises` to simulate a failing model call.
    """

    model = "fake-checker"
    prompt_version = "check-document@vfake"

    def __init__(
        self,
        responder: ModelOutput | Callable[[Standard, DocumentInput], ModelOutput] | None = None,
        raises: Exception | None = None,
    ) -> None:
        self.responder = responder
        self.raises = raises
        self.calls = 0

    def check(self, standard, doc_type_name, doc_type_description, doc, context=None) -> ModelCall:
        self.calls += 1
        if self.raises:
            raise self.raises
        if callable(self.responder):
            out = self.responder(standard, doc)
        elif self.responder is not None:
            out = self.responder
        else:
            out = all_pass(standard)
        return ModelCall(out, self.model, 100, 50, 0.0)


def all_pass(standard: Standard, summary: str = "Looks complete.") -> ModelOutput:
    return ModelOutput(
        summary=summary,
        checks=[
            CheckItem(rule_key=r.key, result="pass", confidence=0.98, note="ok")
            for r, _ in standard.rules()
        ],
    )
