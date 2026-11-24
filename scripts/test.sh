#!/usr/bin/env bash
# Unit tests across /web (Vitest), /mara (pytest, no integration) and /supabase (pytest on pgserver).
# A part is skipped (not failed) only if its folder or config doesn't exist.
# Exit 1 if any part that ran failed.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

# web
if ! has_npm_script web test; then
  skip_part web "web/package.json with a 'test' script not found"
elif ! need_cmd pnpm; then
  RESULTS+=("FAIL  web  (pnpm not installed)"); FAILED=1
else
  run_part web pnpm -C web test
fi

# mara: pytest exit 5 = "no tests collected" is a FAILURE here (the suite must have tests).
if [[ ! -f "$ROOT/mara/pyproject.toml" ]]; then
  skip_part mara "mara/pyproject.toml not found"
elif ! need_cmd uv; then
  RESULTS+=("FAIL  mara  (uv not installed)"); FAILED=1
else
  run_part mara bash -c 'cd mara && uv run pytest -q -m "not integration"'
fi

# supabase
if [[ ! -f "$ROOT/supabase/pyproject.toml" ]]; then
  skip_part supabase "supabase/pyproject.toml not found"
elif ! need_cmd uv; then
  RESULTS+=("FAIL  supabase  (uv not installed)"); FAILED=1
else
  run_part supabase bash -c 'cd supabase && uv run pytest -q'
fi

summary "Unit tests"
