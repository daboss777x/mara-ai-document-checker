#!/usr/bin/env bash
# Integration tests: pytest -m integration in /mara, plus `pnpm -C web test:int` if web defines it.
# Tests that need a real Supabase project skip themselves
# when the env vars are missing (see .env.example), so a local run without env is still meaningful.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

missing=()
for v in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DATABASE_URL; do
  [[ -n "${!v:-}" ]] || missing+=("$v")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "NOTE: not set: ${missing[*]}"
  echo "NOTE: integration tests that need real Supabase will be SKIPPED, not run."
fi

# mara: pytest exit 5 = no integration tests collected yet; not a failure.
if [[ ! -f "$ROOT/mara/pyproject.toml" ]]; then
  skip_part mara "mara/pyproject.toml not found"
elif ! need_cmd uv; then
  RESULTS+=("FAIL  mara  (uv not installed)"); FAILED=1
else
  run_part mara bash -c 'cd mara && { uv run pytest -q -m integration -rs; c=$?; [ $c -eq 5 ] && echo "(no integration tests collected)" && c=0; exit $c; }'
fi

# web (optional)
if has_npm_script web test:int; then
  run_part web pnpm -C web test:int
else
  skip_part web "no 'test:int' script in web/package.json"
fi

summary "Integration tests"
