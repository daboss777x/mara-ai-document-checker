import json
from datetime import date
from types import SimpleNamespace

import pytest

from mara import checker as ck
from mara.config import load_standard
from mara.documents import DocumentInput
from tests.helpers import PDF, output_failing

STD = load_standard("sales_contract")


def test_clean_document_has_no_findings():
    _, findings = ck.evaluate(STD, ck.all_pass(STD))
    assert findings == []


def test_failed_rule_uses_config_severity_and_fix_text():
    _, findings = ck.evaluate(STD, output_failing(STD, "seller_signature", "initials_each_page"))
    by = {f.rule_key: f for f in findings}
    assert by["seller_signature"].severity == "blocker"
    assert by["initials_each_page"].severity == "warning"
    assert "seller" in by["seller_signature"].client_fix_text.lower()
    assert by["seller_signature"].page == 1 and by["seller_signature"].quote == "blank"


@pytest.mark.parametrize(
    ("rule", "below"), [("buyer_signature", 0.89), ("initials_each_page", 0.84)]
)
def test_signatures_need_point_nine_and_initials_point_eight_five(rule, below):
    out = ck.all_pass(STD)
    next(c for c in out.checks if c.rule_key == rule).confidence = below
    _, findings = ck.evaluate(STD, out)
    assert [(f.rule_key, f.severity) for f in findings] == [(rule, "warning")]


def test_clear_initials_at_point_eight_eight_pass():
    """Live Claude rates clean drawn initials ~0.88; that must not raise a warning."""
    out = ck.all_pass(STD)
    next(c for c in out.checks if c.rule_key == "initials_each_page").confidence = 0.88
    assert ck.evaluate(STD, out)[1] == []


def test_signature_at_point_nine_passes_and_other_rules_use_a_lower_floor():
    out = ck.all_pass(STD)
    next(c for c in out.checks if c.rule_key == "buyer_signature").confidence = 0.9
    next(c for c in out.checks if c.rule_key == "sales_price").confidence = 0.6
    assert ck.evaluate(STD, out)[1] == []


def test_unsure_and_unchecked_rules_become_warnings():
    out = ck.all_pass(STD)
    next(c for c in out.checks if c.rule_key == "closing_date").result = "unsure"
    out.checks = [c for c in out.checks if c.rule_key != "sales_price"]
    _, findings = ck.evaluate(STD, out)
    assert {f.rule_key: f.severity for f in findings} == {
        "closing_date": "warning",
        "sales_price": "warning",
    }


def test_unreadable_raises_and_wrong_document_is_a_blocker():
    with pytest.raises(ck.UnreadableDocument):
        ck.evaluate(STD, ck.ModelOutput(summary="blurry", readable=False))
    _, findings = ck.evaluate(STD, ck.ModelOutput(summary="x", document_matches_type=False))
    assert [f.rule_key for f in findings] == ["wrong_document"]


def test_claude_checker_sends_pdf_block_and_parses_json():
    seen = {}

    class Messages:
        def create(self, **kw):
            seen.update(kw)
            payload = ck.all_pass(STD).model_dump()
            return SimpleNamespace(
                stop_reason="end_turn",
                content=[SimpleNamespace(type="text", text=json.dumps(payload))],
                usage=SimpleNamespace(input_tokens=1000, output_tokens=200),
            )

    checker = ck.ClaudeChecker(client=SimpleNamespace(messages=Messages()))
    doc = DocumentInput("pdf", "application/pdf", 1, data=PDF)
    ctx = ck.CheckContext(today=date(2026, 11, 24), client_name="Jordan Avery")
    result = ck.run_check(checker, STD, "Sales contract", "desc", doc, context=ctx)
    assert result.findings == [] and result.model == "claude-opus-5-5"
    assert result.prompt_version == "check-document@v2"
    # the model is told today's date and whose deal it is (date-window and name rules)
    assert "Today's date: 2026-11-24" in seen["system"]
    assert "The client on this deal: Jordan Avery" in seen["system"]
    assert result.cost_usd == pytest.approx(0.008)
    block = seen["messages"][0]["content"][0]
    assert block["type"] == "document" and block["source"]["media_type"] == "application/pdf"
    assert "cedar" in seen["system"].lower() and "buyer_signature" in seen["system"]
    assert seen["output_config"]["format"]["type"] == "json_schema"


def test_claude_checker_refusal_and_bad_json_and_api_error():
    def make(**resp):
        class M:
            def create(self, **kw):
                if "raises" in resp:
                    raise RuntimeError("x")
                return SimpleNamespace(
                    stop_reason=resp.get("stop", "end_turn"),
                    content=[SimpleNamespace(type="text", text=resp.get("text", "{}"))],
                    usage=SimpleNamespace(input_tokens=1, output_tokens=1),
                )

        return ck.ClaudeChecker(client=SimpleNamespace(messages=M()))

    doc = DocumentInput("text", "x", None, text="hello")
    with pytest.raises(ck.UnreadableDocument):
        make(stop="refusal").check(STD, "n", "d", doc)
    with pytest.raises(ck.CheckerError):
        make(text="not json").check(STD, "n", "d", doc)
    with pytest.raises(ck.CheckerError):
        make(raises=True).check(STD, "n", "d", doc)
