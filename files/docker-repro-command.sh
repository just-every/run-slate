#!/bin/bash
set -euo pipefail
slate_repro_checkout="$1"
slate_repro_name="$2"
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock run --rm --init --name "$slate_repro_name" --shm-size=1g \
 --workdir "$slate_repro_checkout" \
 --mount type=bind,src=/home/agent/rer-consolidation/work/sd-slate-c-f199,dst=/home/agent/rer-consolidation/work/sd-slate-c-f199 \
 --mount type=bind,src=/home/agent/.rer/node/node-v22.20.0-linux-x64,dst=/opt/slate-node,readonly \
 --mount type=bind,src=/home/agent/.rer/toolchain/pnpm-10.12.4,dst=/opt/slate-pnpm,readonly \
 --mount type=bind,src=/tmp/rer-cloud-toolchain.sh,dst=/tmp/rer-cloud-toolchain.sh,readonly \
 --mount type=bind,src=/tmp/slate-container-repro.sh,dst=/tmp/slate-container-repro.sh,readonly \
 --mount "type=bind,src=$CODEX_PROXY_CERT,dst=/run/proxy-ca.pem,readonly" \
 -e NODE_EXTRA_CA_CERTS=/run/proxy-ca.pem -e PATH=/opt/slate-node/bin:/opt/slate-pnpm/node_modules/.bin:/usr/local/bin:/usr/bin:/bin \
 -e SLATE_UI_SHARD=5/8 -e SLATE_UI_ASSIGNMENTS=.github/scripts/journey-shards.json \
 -e SERIAL_SUITE=true -e WORKER_SHARD=0 \
 -e "SUITE_COMMAND=node --test --test-concurrency=1 --test-name-pattern='^genuine insertion focus.*1440' tests/ui/polish-journeys.test.mjs" \
 mcr.microsoft.com/playwright@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27 \
 bash /tmp/slate-container-repro.sh
