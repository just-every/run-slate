# Same-page offline and authorization boundary regressions

Run with the repository's pinned runtime and cached Chromium:

```sh
pnpm exec tsx --test tests/qualification/offline-refresh/transport.test.ts
QUAL_EVIDENCE=/absolute/evidence/hook node tests/qualification/offline-refresh/hook.browser.mjs
pnpm typecheck
pnpm build
QUAL_EVIDENCE=/absolute/evidence/native node tests/qualification/offline-refresh/native.browser.mjs
```

The transport test uses actual interrupted Response streams. The browser hook probe bundles the production hook and React, with explicitly synthetic fetch fixtures confined to tests. It checks strict defaults, opt-in retention, denial/error classification, cancellation, route changes, identity remounts and unmounts. The native test runs the real emitted Worker on 8742/8743, types through the keyboard, interrupts a real appearance refresh with browser offline mode, checks DOM identity and exact recovery, separates read/write retries, and exercises actual grant narrowing/revocation and session loss. Identity fixtures substitute mailbox possession; no provider or deployment claim. Every browser and Worker closes in finally.

The preexisting `interface/resource.mjs` holds the second page GET following one page-mutated event. Consolidating that event to one authoritative read makes its original request-count assumption fail (`Background reload did not arrive`). It is preserved unchanged. The new native test holds the first authoritative real page response, advances committed metadata and issues another event, then checks that the older response cannot undo the newer one. The unchanged check remains a separately recorded acceptance HOLD.
