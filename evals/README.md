# Evals

Six fictitious sales-contract cases (`cases/*.pdf` + `*.json`) run through Mara's real
checker pipeline: good, missing signature, missing initials, blank required field, missing
date, unreadable.

```bash
pnpm eval              # fake model: no network, free. Proves rules, confidence floors, failure path.
pnpm eval -- --live    # real Claude (ANTHROPIC_API_KEY, MARA_CHECK_MODEL optional). A few cents.
```

- Fake mode must flag exactly the expected rules. Live mode must flag every expected rule;
  extra warnings are printed but do not fail.
- Rerun after any change to `prompts/check_document.md` or `config/standards/*.yaml`
  (and bump the prompt `version`).
- Regenerate the PDFs: `cd mara && uv run python ../evals/make_cases.py`.
- Only fictitious documents (Cedar & Stone Realty). Never put real client documents here.
