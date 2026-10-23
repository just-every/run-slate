#!/usr/bin/env bash
set -euo pipefail

# Bounded retries use mirrors of the same Ubuntu-signed archive. Root owns
# timeout so a stalled apt/dpkg cannot retain a lock after an attempt ends.
mirrors=(runner-default http://mirrors.edge.kernel.org/ubuntu http://us-east-1.ec2.archive.ubuntu.com/ubuntu)
started=$SECONDS
for attempt in 1 2 3; do
  mirror=${mirrors[attempt - 1]}
  if [[ $mirror != runner-default ]]; then
    sudo sed -i -E "s@^(URIs:[[:space:]]*)(mirror\+file:/etc/apt/apt-mirrors\.txt|https?://(([a-z0-9.-]+\.)?archive\.ubuntu\.com|security\.ubuntu\.com|mirrors\.edge\.kernel\.org)/ubuntu/?)@\1${mirror}/@" /etc/apt/sources.list.d/ubuntu.sources
  fi
  printf 'Chromium apt: attempt %s/3 (90s deadline; mirror %s)\n' "$attempt" "$mirror"
  if sudo env "PATH=$PATH" HOME=/root timeout --kill-after=5s 90s bash -ec '
    dpkg --configure -a
    pnpm exec playwright install-deps chromium
  '; then
    printf 'Chromium apt: complete (attempts=%s mirror=%s seconds=%s)\n' "$attempt" "$mirror" "$((SECONDS - started))"
    break
  else
    status=$?
    printf 'Chromium apt: attempt %s/3 failed (mirror %s, exit %s)\n' "$attempt" "$mirror" "$status" >&2
  fi
  if (( attempt == 3 )); then exit "$status"; fi
  sleep "$((attempt * 2))"
done
timeout --kill-after=5s 120s pnpm exec playwright install --only-shell chromium
