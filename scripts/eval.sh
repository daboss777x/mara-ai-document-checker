#!/usr/bin/env bash
# AI evals: runs evals/run_evals.py (fake model by default; `pnpm eval --live` for real calls).
# Uses /mara's uv env so the runner can import mara code; falls back to bare Python.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="$ROOT/evals/run_evals.py"

[[ -f "$RUNNER" ]] || { echo "eval: $RUNNER not found" >&2; exit 1; }

# `pnpm eval -- --live` passes a literal "--" through; drop it.
args=()
for a in "$@"; do [[ "$a" == "--" ]] || args+=("$a"); done
set -- "${args[@]+"${args[@]}"}"

if [[ -f "$ROOT/mara/pyproject.toml" ]] && command -v uv >/dev/null 2>&1; then
  exec uv run --project "$ROOT/mara" python "$RUNNER" "$@"
elif command -v uv >/dev/null 2>&1; then
  exec uv run --no-project python "$RUNNER" "$@"
elif command -v python3 >/dev/null 2>&1; then
  exec python3 "$RUNNER" "$@"
else
  echo "eval: neither uv nor python3 found" >&2
  exit 1
fi
