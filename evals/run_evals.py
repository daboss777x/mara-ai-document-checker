"""Mara document-check evals: six fictitious cases through the real checker pipeline.

    pnpm eval              fake model (no network, no cost): checks Mara's rules and plumbing
    pnpm eval -- --live    real Claude (needs ANTHROPIC_API_KEY; costs a few cents)

Run through `uv run --project mara` (scripts/eval.sh does). Exits non-zero on any miss.
Fake mode must flag exactly the expected rules. Live mode must flag every expected rule
(recall 100%); extra findings are reported but don't fail the run, except for `strict` cases
(the realistic real_* PDFs from scripts/make_demo_docs.py), which must flag exactly the
expected rules: a clean document has to come back clean. Strict cases are live-only (their
drawn signatures can't be read by the text-based fake model).
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
from datetime import date
from pathlib import Path

from pypdf import PdfReader

from mara import checker as ck
from mara.config import load_document_types, load_standard
from mara.documents import prepare

CASES_DIR = Path(__file__).resolve().parent / "cases"


def fake_responder(standard, doc) -> ck.ModelOutput:
    """Reads the fictitious PDF's `Label: value` lines like a (literal-minded) model."""
    text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(doc.data)).pages)
    rows = [
        (label.strip().lower(), value.strip())
        for label, _, value in (ln.partition(":") for ln in text.splitlines())
        if _
    ]
    if not rows:
        return ck.ModelOutput(summary="The page is too smudged to read.", readable=False)
    checks = []
    for rule, _cat in standard.rules():
        words = rule.key.split("_")
        row = next((r for r in rows if all(w in r[0] for w in words)), None)
        if row is None:
            result, conf, quote = "unsure", 0.4, None
        elif not row[1] or set(row[1]) <= {"_"}:
            result, conf, quote = "fail", 0.95, f"{row[0]}: blank"
        else:
            result, conf, quote = "pass", 0.97, f"{row[0]}: {row[1]}"
        checks.append(
            ck.CheckItem(
                rule_key=rule.key, result=result, confidence=conf, page=1, quote=quote, note=result
            )
        )
    return ck.ModelOutput(summary="Fake model summary.", checks=checks)


def run_case(path: Path, checker) -> tuple[bool, str]:
    meta = json.loads(path.read_text())
    types = {t.key: t for t in load_document_types()}
    dtype = types[meta["document_type"]]
    standard = load_standard(dtype.standard_key)
    doc = prepare(path.with_suffix(".pdf").read_bytes(), "application/pdf")
    expected = set(meta["expect_flagged"])
    try:
        context = ck.CheckContext(
            today=date.today(), client_name=meta.get("client_name", "Jordan Avery")
        )
        result = ck.run_check(
            checker, standard, dtype.name, dtype.description, doc, context=context
        )
    except ck.UnreadableDocument:
        ok = bool(meta.get("expect_unreadable"))
        return ok, "unreadable -> failure path" + ("" if ok else " (NOT expected)")
    if meta.get("expect_unreadable"):
        return False, "expected unreadable but the document was checked"
    flagged = {f.rule_key for f in result.findings}
    missed, extra = expected - flagged, flagged - expected
    ok = not missed
    detail = f"flagged={sorted(flagged) or '-'}"
    if missed:
        detail += f" MISSED={sorted(missed)}"
    if extra:
        detail += f" extra={sorted(extra)}"
    return ok, detail, extra


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="use the real Claude API")
    args = ap.parse_args()
    cases = sorted(CASES_DIR.glob("*.json"))
    if not cases:
        print("no cases: run `cd mara && uv run python ../evals/make_cases.py`")
        return 1
    if args.live:
        checker = ck.ClaudeChecker()
        print(f"LIVE run with {checker.model}")
    else:
        checker = ck.FakeChecker(fake_responder)
        print("fake model (use --live for the real API)")
    failures = 0
    skipped = 0
    for path in cases:
        strict = bool(json.loads(path.read_text()).get("strict"))
        if strict and not args.live:
            skipped += 1
            continue
        out = run_case(path, checker)
        ok, detail, extra = (out[0], out[1], out[2] if len(out) > 2 else set())
        if (not args.live or strict) and extra:
            ok = False
        failures += not ok
        print(f"  {'PASS' if ok else 'FAIL'}  {path.stem:44} {re.sub(r'\s+', ' ', detail)}")
    ran = len(cases) - skipped
    note = f" ({skipped} strict live-only cases skipped; use --live)" if skipped else ""
    print(f"{ran - failures}/{ran} cases passed{note}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
