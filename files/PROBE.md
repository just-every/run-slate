# Desktop refresh diagnostic

The unmodified full desktop registration passed locally on the merged tree. The supplementary diagnostic delays only delivery of the native GET triggered after saving the proposed outcome, by 6000 ms. It does not substitute application responses or data. The original outcome-visibility assertion remains unchanged in the original-source diagnostic.

Run from the checkout root after setup/build and sourcing /tmp/rer-cloud-toolchain.sh:

```sh
SLATE_CHROMIUM_PATH=/usr/bin/chromium SLATE_PROBE_ORIGINAL=1 SLATE_PROBE_REPORT=/tmp/locator-original.json cloud_run timeout --signal=TERM --kill-after=20s 300s node /path/to/latency-probe.mjs
SLATE_CHROMIUM_PATH=/usr/bin/chromium SLATE_PROBE_REPORT=/tmp/locator-fixed.json cloud_run timeout --signal=TERM --kill-after=20s 300s node /path/to/latency-probe.mjs
```

The runner reads the published candidate test from Git when SLATE_PROBE_ORIGINAL=1 and the current journey otherwise. Imports resolve against the current checkout. All page lifecycle, duplicate refusal, exact history, page-invariance and revoked-access checks execute through the native emitted Worker. The diagnostic is report-only; the committed journey has no artificial delay.
