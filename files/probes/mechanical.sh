#!/usr/bin/env bash
set -euo pipefail
trap 'git checkout origin/main -- ACCEPTANCE.md docs/CLAIMS.md' EXIT
node src/base/runtime/contract-docs.mjs write
node src/base/runtime/contract-docs.mjs check
git checkout origin/main -- ACCEPTANCE.md docs/CLAIMS.md
pnpm integration:sync
pnpm source:lock > /tmp/slate-f182-mechanical-lock.log 2>&1
pnpm source:check > /tmp/slate-f182-mechanical-source.log 2>&1
git diff --exit-code
printf '%s\n' 'MECHANICAL lock=pnpm source:lock and pnpm source:check exit=0; views=node src/base/runtime/contract-docs.mjs write and check, restored origin/main views exit=0; ledger=none exit=0'
