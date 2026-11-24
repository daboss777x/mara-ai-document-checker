#!/usr/bin/env bash
# Shared helpers for scripts/*.sh. Sourced, not executed.
# Each part (web / mara / supabase) is run with run_part, which records
# PASS / FAIL / SKIP so the caller can print one summary and set the exit code.

# Repo root = parent of this file's folder.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT

RESULTS=()
FAILED=0

# skip_part <name> <reason>
skip_part() {
  printf '\n--- %s: SKIPPED (%s)\n' "$1" "$2"
  RESULTS+=("SKIP  $1  ($2)")
}

# run_part <name> <command...>   (command runs from repo root)
run_part() {
  local name="$1"
  shift
  printf '\n=== %s: %s\n' "$name" "$*"
  if (cd "$ROOT" && "$@"); then
    RESULTS+=("PASS  $name")
  else
    local code=$?
    RESULTS+=("FAIL  $name  (exit $code)")
    FAILED=1
  fi
}

# has_npm_script <dir> <script-name>: true if <dir>/package.json defines it.
has_npm_script() {
  local pkg="$ROOT/$1/package.json"
  [[ -f "$pkg" ]] || return 1
  node -e 'const s=require(process.argv[1]).scripts||{}; process.exit(s[process.argv[2]]?0:1)' "$pkg" "$2"
}

# need_cmd <cmd>: true if the command is on PATH.
need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

# summary <title>: print results; exit 1 if anything failed.
summary() {
  printf '\n=== %s summary\n' "$1"
  local r
  for r in "${RESULTS[@]}"; do
    printf '  %s\n' "$r"
  done
  if [[ "$FAILED" -ne 0 ]]; then
    echo "$1: FAILED (see FAIL lines above)" >&2
    exit 1
  fi
  echo "$1: OK"
}
