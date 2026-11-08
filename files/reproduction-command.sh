#!/bin/bash
set -uo pipefail
. /tmp/rer-cloud-toolchain.sh
export PATH="$HOME/.rer/toolchain/node-22.20.0/node_modules/node/bin:$PATH"
cloud_run timeout 1800 env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock run --rm --name slate-f209-tooling-valid --init \
  --user "$(id -u):$(id -g)" --workdir /workspace/run-slate \
  --mount "type=bind,src=$PWD/..,dst=/workspace" \
  --mount "type=bind,src=$HOME/.rer/toolchain/node-22.20.0/node_modules/node,dst=/opt/node,readonly" \
  --mount "type=bind,src=$HOME/.rer/toolchain/pnpm-10.12.4/node_modules/pnpm,dst=/opt/pnpm,readonly" \
  --mount "type=bind,src=/tmp/slate-repro-bin,dst=/opt/fleet-bin,readonly" \
  --mount "type=bind,src=/tmp/slate-repro-bin/chromium,dst=/usr/bin/chromium,readonly" \
  --mount "type=bind,src=/etc/ssl/certs/ca-certificates.crt,dst=/run/proxy-ca.pem,readonly" \
  --env NODE_EXTRA_CA_CERTS=/run/proxy-ca.pem --env NODE_USE_ENV_PROXY=1 \
  --env NO_PROXY=localhost,127.0.0.1,::1 --env no_proxy=localhost,127.0.0.1,::1 \
  --env SLATE_CHROMIUM_PATH=/usr/bin/chromium \
  --env SLATE_UI_SHARD=2/8 --env SLATE_UI_ASSIGNMENTS=.github/scripts/journey-shards.json \
  --env SERIAL_SUITE=false --env WORKER_SHARD=1 \
  --env 'SUITE_COMMAND=pnpm test:base-proof && pnpm test:docs && pnpm test:typegen && pnpm test:portability && pnpm test:release-source && pnpm test:rer-editor' \
  --env GIT_AUTHOR_NAME='Run Edit Run fleet' --env GIT_AUTHOR_EMAIL=fleet@runeditrun.com \
  --env GIT_COMMITTER_NAME='Run Edit Run fleet' --env GIT_COMMITTER_EMAIL=fleet@runeditrun.com \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c 'export PATH=/opt/node/bin:/opt/fleet-bin:$PATH; node --version; pnpm --version; cat /etc/os-release; bash .github/scripts/run-shard.sh'
result=$?
printf 'REPRODUCTION_EXIT=%s\n' "$result"
exit "$result"
