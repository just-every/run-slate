#!/usr/bin/env bash
set -euo pipefail

# Timings from 40435042833/40445465714 put the browser lane beside the
# Workers + suite lane rather than serializing three independent runtimes.
mkdir -p .artifacts/ci
other_lane() {
  if (( WORKER_SHARD != 0 )); then
    pnpm exec vitest run --shard="$WORKER_SHARD/6" \
      --testNamePattern="^(?!Undo removes unedited and merely shared imported pages).*$" \
      --reporter=default --reporter=json --outputFile=".artifacts/contract-$WORKER_SHARD.json" || return "$?"
  fi
  bash -euo pipefail -c "$SUITE_COMMAND"
}
other_lane > .artifacts/ci/worker-suite.log 2>&1 &
other_pid=$!
# Always join the process we own, including when the foreground lane fails.
trap 'wait "$other_pid" || true' EXIT
journey_status=0
# The long desktop core journey otherwise shares delivery's already costly
# invitation/custody tests. Move that whole workspace to the lighter polish
# lane; the phone journey and every other ordinal registration stay in place.
if [[ "${CORE_DESKTOP:-false}" != true ]]; then
  node --test --test-concurrency=1 --test-name-pattern='^(?!real core-wiki and touch-member journeys at 1440px)' \
    tests/qualification/ui-convergence/journeys.test.mjs || journey_status=$?
fi
# The former seventh partition fits beside the shorter phone-focus partition,
# leaving the long desktop core workspace alone rather than adding its costs.
if [[ "${POLISH_JOURNEYS:-false}" = true ]]; then
  SLATE_UI_SHARD=7/8 node --test --test-concurrency=1 \
    --test-name-pattern='^(?!real core-wiki and touch-member journeys at 1440px)' \
    tests/qualification/ui-convergence/journeys.test.mjs || journey_status=$?
fi
if [[ "${CORE_DESKTOP:-false}" = true ]]; then
  SLATE_UI_SHARD=1/1 node --test --test-concurrency=1 \
    --test-name-pattern='^real core-wiki and touch-member journeys at 1440px' \
    tests/qualification/ui-convergence/journeys.test.mjs || journey_status=$?
fi
other_status=0
wait "$other_pid" || other_status=$?
cat .artifacts/ci/worker-suite.log
printf 'Shard lane results: journeys=%s worker-suite=%s\n' "$journey_status" "$other_status"
test "$journey_status" -eq 0
test "$other_status" -eq 0
