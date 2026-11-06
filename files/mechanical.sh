set -euo pipefail
. /tmp/rer-cloud-toolchain.sh
node src/base/runtime/contract-docs.mjs write
node src/base/runtime/contract-docs.mjs check
git checkout origin/main -- ACCEPTANCE.md docs/CLAIMS.md
node scripts/sync-integration.mjs --check
node scripts/edition-authoring/cli.mjs lock > /tmp/slate-mechanical-lock.json
node scripts/edition-authoring/cli.mjs check > /tmp/slate-mechanical-lock-check.json
git diff --exit-code
printf '%s\n' 'MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/runtime/contract-docs.mjs write then check and restore views exit=0; ledger=none exit=0'
