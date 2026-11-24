#!/usr/bin/env bash
# Prints a new 32-byte random hex secret for MARA_HMAC_SECRET.
# Put the same value in Vercel env, Modal secret "mara-secrets" and Supabase Vault (mara_hmac_secret).
set -euo pipefail
command -v openssl >/dev/null 2>&1 || { echo "gen-hmac-secret: openssl not found" >&2; exit 1; }
openssl rand -hex 32
