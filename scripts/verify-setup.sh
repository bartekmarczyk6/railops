#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  printf 'verify-setup: FAIL — %s\n' "$1" >&2
  exit 1
}

[ -f scripts/setup.sh ] || fail 'scripts/setup.sh is missing'

printf 'verify-setup: bash -n scripts/setup.sh\n'
bash -n scripts/setup.sh || fail 'setup.sh has syntax errors'
bash -n scripts/verify-setup.sh || fail 'verify-setup.sh has syntax errors'

head -n 1 scripts/setup.sh | grep -q '^#!/usr/bin/env bash$' || fail 'setup.sh is missing the bash shebang'
grep -q -- '--dry-run' scripts/setup.sh || fail 'setup.sh is missing --dry-run support'

if grep -Eq 'gsk_[A-Za-z0-9]{20,}|sk-or-v1-[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}' scripts/setup.sh; then
  fail 'setup.sh appears to contain a hard-coded API key'
fi
if grep -Eiq 'pg_isready|postgres|hermes' scripts/setup.sh; then
  fail 'setup.sh references database/hermes tooling it must not install'
fi

printf 'verify-setup: dry-run #1 (no installs, no writes, no network)\n'
bash scripts/setup.sh --dry-run || fail 'setup.sh --dry-run exited non-zero'

printf 'verify-setup: dry-run #2 (idempotent re-run)\n'
bash scripts/setup.sh --dry-run || fail 'setup.sh --dry-run is not idempotent'

printf 'verify-setup: OK\n'
