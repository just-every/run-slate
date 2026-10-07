# Page navigation read regression

The emitted Worker and real Chromium tests use native sessions, APIs and controls.
They add no response interception, product fallback, authorization cache or changed
original deadline. The local identity fixture substitutes mailbox possession only.

Build with the repository's pinned Node/pnpm, then run in an isolated environment:

```sh
QUAL_EVIDENCE=/absolute/receipts/copied \
QUAL_RESTORED_STATE=/absolute/authorized/stopped/synthetic/state \
node --experimental-sqlite tests/qualification/release-navigation-performance/restored-page.mjs

QUAL_PORT_RANGE=59800-59819 QUAL_EVIDENCE=/absolute/receipts/native \
node tests/qualification/release-navigation-performance/native-journeys.mjs

SLATE_PROFILE=flagship QUAL_PORT_RANGE=59800-59819 \
QUAL_EVIDENCE=/absolute/receipts/original-shell \
node tests/qualification/release-navigation-performance/preserved-shell.mjs
```

The copied-restore test owns ports 59800–59801. It hashes the stopped original,
byte-copies it, inserts a synthetic magic link only into the copy, checks native
page title/body/recents, records actual requests and the unchanged 30-second
Playwright networkidle boundary, then proves the original is unchanged and removes
the copy. It rejects a second page-list read and any leaf expansion read. Run it
against the built parent source before the fix for a negative control. The supplied
state is the original qualification's completed four-import restore, not a recreated
small substitute.

The native journey owns 59802–59803 and checks recent navigation, persisted parent
expansion, a leaf gaining a child, real create/rename/reviewed move/trash, explicit
tree invalidation, distinct actor data and expansion, grant revocation, actor change
and logout. It captures 1440px and 390px navigation. The preserved-shell runner owns
59804–59805 and invokes the three original core shell checks unchanged. Their
Connections assertion requires the original flagship qualification profile; the
new navigation journey itself uses the default core-wiki profile.

All runners close their own browser and Worker process group in `finally`.
Fresh-runtime state under the requested evidence directory is a private synthetic
fixture, with a generated local session secret; retain only sanitized receipts and
captures when sharing results and remove that state/configuration after inspection.
