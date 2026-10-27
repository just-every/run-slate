#!/usr/bin/env bash
set -euo pipefail

mkdir -p .artifacts/ci
other_lane() {
  if (( WORKER_SHARD != 0 )); then
    pnpm exec vitest run --shard="$WORKER_SHARD/6" \
      --testNamePattern="^(?!Undo removes unedited and merely shared imported pages).*$" \
      --reporter=default --reporter=json --outputFile=".artifacts/contract-$WORKER_SHARD.json" || return "$?"
  fi
  bash -euo pipefail -c "$SUITE_COMMAND"
}
public_journeys() {
  node --test --test-concurrency=1 tests/qualification/ui-convergence/journeys.test.mjs
}
journey_status=0
other_status=0
if [[ "${SERIAL_SUITE:-false}" = true ]]; then
  # The focus lifecycles retain their existing deadlines and own the browser.
  # Their small public partition finishes before the focus process starts.
  test "$WORKER_SHARD" -eq 0
  public_journeys || journey_status=$?
  other_lane > .artifacts/ci/worker-suite.log 2>&1 || other_status=$?
else
  other_lane > .artifacts/ci/worker-suite.log 2>&1 &
  other_pid=$!
  # Join only the child we started, even when the foreground lane fails.
  trap 'wait "$other_pid" || true' EXIT
  public_journeys || journey_status=$?
  wait "$other_pid" || other_status=$?
fi
cat .artifacts/ci/worker-suite.log
printf 'Shard lane results: journeys=%s worker-suite=%s\n' "$journey_status" "$other_status"
test "$journey_status" -eq 0
test "$other_status" -eq 0
