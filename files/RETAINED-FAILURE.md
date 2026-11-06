# Retained causal evidence supplied with the brief

This is a transcription of the completed attribution supplied by FV, not a new run, downloaded log, or repeated diagnostic.

- Original head: 52b6d73b83c0cf8c326a104ff052c95e8aa0ca4a.
- Guarded original final: 0573a4c6c54e2e89bf714fd848b8a8e948ff03dd.
- Refused Verify: 42121393981, attempt 1.
- Causal commit: 981debabad2b11bf5914c8346c9d9642944e6275.
- Its direct parent, passing main: 51162d87a91a4556ab68fdee79caa26e1b747a29. It is not a later superseding repair.
- Refused route blob: 84b4fbb21adf2aac3315c165fc20644f6672f4a2.
- PATCH /api/pages/:id returned HTTP 200 with only updatePage's unchanged `{value,receipt}` after the route removed top-level `document` at routes.ts:60.
- Existing `tests/e2e/pages/display-options.test.ts` failed at 41:29 when reading `changed.document.properties`.
- The same test/argv/SAME runner passed on parent main. Attribution is complete and was not repeated here.

The changed candidate retains direct route serialization but now includes the guarded original document inside updatePage's atomic operation receipt. The existing display-options assertion remains, with additional exact/concurrent/replay assertions. Its changed-head run passes (see affected.log and receipt.json).

REV006 job 127575623740 is a separate retained dependency on original verified-app-build artifact 13458407198 from SAME MAIN/FV custody with supported transport. No substitute build was used for that qualification, no further diagnostic was requested, and no REV006 acceptance is claimed.
