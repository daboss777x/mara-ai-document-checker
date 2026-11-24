# Prompts

Every prompt Mara sends to a model lives here as one Markdown file. Code loads prompts by
`name`; it never inlines prompt text. Each model call records the prompt `name` and `version`
in `ai_runs`.

## File convention

- File name: `<name>.md`, lowercase with hyphens (e.g. `classify-document.md`).
- Every file starts with a YAML front-matter header:

```yaml
---
name: classify-document        # matches the file name
version: 1                     # integer; bump on ANY change to the body or header
model_tier: small              # large | small (mapped to concrete model IDs in /mara config)
changelog:
  - "1: first version"         # newest last; one line per version, saying what changed
---
```

- The body below the header is the prompt text. Use `{{placeholder}}` for values filled in at runtime.
- Files starting with `_` (like `_template.md`) are not loaded.

## Rules

1. **Bump `version` and add a `changelog` line on every change**, however small.
2. **Rerun the evals** after any change: `pnpm eval`. CI runs them automatically when
   `prompts/**` or `evals/**` change.
3. Every prompt that can lead to outbound text keeps the guardrails from CLAUDE.md: no contract
   interpretation for clients, no legal or financial advice, no negotiating, and never any
   banking or wiring details. The code-level outbound filter backs this up; the prompt must too.
4. Only fictitious examples (Cedar & Stone Realty) in prompts. No real client data.

Start a new prompt by copying `_template.md`.
