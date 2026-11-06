set -eu
pnpm integration:sync
node src/base/runtime/contract-docs.mjs write
node src/base/runtime/contract-docs.mjs check
git checkout origin/main -- ACCEPTANCE.md docs/CLAIMS.md
node scripts/edition-authoring/cli.mjs lock > /tmp/slate-final-lock.json
node scripts/edition-authoring/cli.mjs check > /tmp/slate-final-lock-check.json
node scripts/sync-integration.mjs --check
test -z "$(git status --porcelain)"
