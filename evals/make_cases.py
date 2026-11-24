"""Generate the six fictitious eval documents into evals/cases/.

    cd mara && uv run python ../evals/make_cases.py

Everything here is made up (Cedar & Stone Realty demo). Never add real client documents.
"""

from __future__ import annotations

import json
from pathlib import Path

from mara.testing import make_pdf

CASES = Path(__file__).resolve().parent / "cases"

GOOD = {
    "Property address": "1208 Barton Hills Dr, Austin TX 78704",
    "Sales price": "$412,000",
    "Closing date": "2027-01-15",
    "Effective date": "2026-11-20",
    "Buyer signature": "/s/ Enoch Omunu",
    "Buyer signed date": "2026-11-20",
    "Seller signature": "/s/ Maria Alvarez",
    "Initials each page": "/s/ EO",
    "All pages present": "yes, pages 1 of 1",
}

# name -> (what to blank, rule keys Mara must flag)
VARIANTS = {
    "good": ({}, []),
    "missing_signature": ({"Seller signature": ""}, ["seller_signature"]),
    "missing_initials": ({"Initials each page": ""}, ["initials_each_page"]),
    "blank_required_field": ({"Sales price": ""}, ["sales_price"]),
    "missing_date": ({"Effective date": ""}, ["effective_date"]),
}


def lines(values: dict[str, str]) -> list[str]:
    out = ["Residential Sales Contract (fictitious sample, Cedar & Stone Realty)", ""]
    for label, value in values.items():
        out.append(f"{label}: {value if value else '____________________'}")
    return out


def main() -> None:
    CASES.mkdir(exist_ok=True)
    for name, (blank, flagged) in VARIANTS.items():
        pdf = make_pdf([lines({**GOOD, **blank})])
        (CASES / f"{name}.pdf").write_bytes(pdf)
        meta = {"document_type": "sales_contract", "expect_flagged": flagged}
        (CASES / f"{name}.json").write_text(json.dumps(meta, indent=2) + "\n")
    # unreadable: a nearly blank, smudged page
    (CASES / "unreadable.pdf").write_bytes(make_pdf([["~ ~ . ,  ' `  ~ ."]]))
    meta = {"document_type": "sales_contract", "expect_flagged": [], "expect_unreadable": True}
    (CASES / "unreadable.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"wrote {len(VARIANTS) + 1} cases to {CASES}")


if __name__ == "__main__":
    main()
