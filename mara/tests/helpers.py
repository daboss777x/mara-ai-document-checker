from mara.checker import CheckItem, ModelOutput
from mara.config import Standard
from mara.testing import make_pdf

PDF = make_pdf([["Residential Sales Contract (fictitious)", "Buyer signature: /s/ Enoch Omunu"]])


def output_failing(standard: Standard, *failing: str, confidence: float = 0.97) -> ModelOutput:
    checks = [
        CheckItem(
            rule_key=r.key,
            result="fail" if r.key in failing else "pass",
            confidence=confidence,
            page=1,
            quote="blank" if r.key in failing else "ok",
            note="missing" if r.key in failing else "fine",
        )
        for r, _ in standard.rules()
    ]
    return ModelOutput(summary="Test summary.", checks=checks)
