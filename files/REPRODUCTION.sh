#!/bin/bash
set -euo pipefail
export PATH="/opt/fleet-node/node_modules/node/bin:/opt/fleet-pnpm/node_modules/.bin:$PATH"
export NO_PROXY=localhost,127.0.0.1,::1
export no_proxy="$NO_PROXY"
export NODE_USE_ENV_PROXY=1
export NODE_EXTRA_CA_CERTS=/run/fleet-ca.pem
export SLATE_CHROMIUM_PATH=/usr/bin/chromium
cloud_run() { python3 /tmp/rer-reap.py "$@"; }
node -v
pnpm --version
cat /etc/os-release | head -4
git rev-parse HEAD
cloud_run npx -y @runeditrun/rer build
export SLATE_UI_SHARD=8/8
export SLATE_UI_ASSIGNMENTS=.github/scripts/journey-shards.json
export SERIAL_SUITE=false
export WORKER_SHARD=3
export SUITE_COMMAND="node --test --test-concurrency=1 --test-name-pattern='^visible Slate polish.*390' tests/ui/polish-journeys.test.mjs"
cloud_run timeout 1800 bash .github/scripts/run-shard.sh
