#!/bin/bash
set -euo pipefail
node src/base/runtime/contract-docs.mjs write
node src/base/runtime/contract-docs.mjs check
git checkout origin/main -- ACCEPTANCE.md docs/CLAIMS.md
pnpm integration:sync
pnpm source:lock > /tmp/slate-mechanical-lock.log 2>&1
pnpm source:check > /tmp/slate-mechanical-lock-check.log 2>&1
printf 'Edition source lock write and check: exit 0\n'
git diff --exit-code
printf 'Product tree and restored views match the candidate: exit 0\n'
