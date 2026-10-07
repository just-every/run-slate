# Intelligence interface verification

Run `node tests/flagship/intelligence-ui/review-live.mjs` against an explicitly configured local test runtime. This browser probe exercises exact revision opening, proposal acceptance boundaries, selection CAS, retained operation keys on failed retry, mobile overflow and accessibility. Screenshots go to `SLATE_BROWSER_EVIDENCE` or the local `.artifacts/browser/intelligence-ui` directory. Provider/run responses are intercepted in this test; it is not live-provider acceptance. Production build and `pnpm typecheck` are separate checks.
