#!/usr/bin/env bash
# Lint + typecheck: web (eslint, tsc) and mara (ruff). Skips parts that don't exist yet.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

for s in lint typecheck; do
  if has_npm_script web "$s"; then
    run_part "web $s" pnpm -C web "$s"
  else
    skip_part "web $s" "no '$s' script in web/package.json"
  fi
done

if [[ ! -f "$ROOT/mara/pyproject.toml" ]]; then
  skip_part "mara ruff" "mara/pyproject.toml not found"
elif ! need_cmd uv; then
  RESULTS+=("FAIL  mara ruff  (uv not installed)"); FAILED=1
else
  run_part "mara ruff" bash -c 'cd mara && uv run ruff check .'
fi

summary "Lint"
