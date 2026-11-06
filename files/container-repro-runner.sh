#!/bin/bash
set -euo pipefail
slate_browser=(/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell)
test -x "${slate_browser[0]}"
ln -s "${slate_browser[0]}" /usr/bin/chromium
slate_uid_user="$(getent passwd 1000 | cut -d: -f1)"
slate_uid_home="$(getent passwd 1000 | cut -d: -f6)"
exec /usr/sbin/runuser -u "$slate_uid_user" -- env HOME="$slate_uid_home" PATH="$PATH" bash -c '
set -euo pipefail
git config --global user.name "Run Edit Run fleet"
git config --global user.email fleet@runeditrun.com
. /tmp/rer-cloud-toolchain.sh
export PATH=/opt/slate-node/bin:/opt/slate-pnpm/node_modules/.bin:$PATH
export SLATE_CHROMIUM_PATH=/usr/bin/chromium
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
node -v
pnpm --version
git rev-parse HEAD
cloud_run perl -e '\''alarm 1200; exec @ARGV'\'' -- bash .github/scripts/run-shard.sh
'
