# Reproduce the controlled comments experiment

This is investigation code, carried only on the report ref. Use each declared source ref in its own checkout and its own emitted build, with dependencies installed. Copy isolate-comments.mjs into the checkout's ignored .artifacts/ directory, then run `python3 build-comments-gate.py <checkout>` (script path points to this packet). It writes a temporary instrumented copy of that checkout's own comment journey under .artifacts; it does not modify tracked source.

Run through the cloud toolchain's cloud_run:

```
SLATE_CHROMIUM_PATH=/usr/bin/chromium PROBE_WIDTH=390 PROBE_TRIALS=1 node .artifacts/isolate-comments-gated.mjs
SLATE_CHROMIUM_PATH=/usr/bin/chromium PROBE_WIDTH=390 PROBE_TRIALS=3 node .artifacts/isolate-comments.mjs
```

PROBE_RESULT can select the structured output file. Each trial is an independent workspace and native sessions, not a retry of a failed assertion. First-run fixture preparation calls the genuine first-run endpoint to create Handbook. The rest of commentAuthorshipJourney runs unchanged except for the controlled response gate in the instrumented copy.

The gate arms only after final navigation is idle and before opening Comments. It fetches the genuine comments response through Chromium's own route, records its real status and deleted records, and withholds delivery. All mutation and separate actor-transport snapshot traffic runs normally. Old code immediately evaluates the empty DOM and fails; a finally block releases delivery for cleanup. Fixed code starts the existing visible-tombstone assertion, records the empty inventory, releases that same response, waits for the assertion and verifies the exact order. No response body/status, product data, limiter, delete completion, application implementation or CI registration changes.

The three baseline controlled result files intentionally contain assertion failures. They are successful reproductions of the reported race, not passing acceptance tests. Fixed and exact-candidate result files must contain only passes. Historical artifacts were built from the two exact historical refs; their commit and output digests are retained in the build-source receipts. No limiter bypass seam exists in the inspected native harness, so all runs retain native limits.
