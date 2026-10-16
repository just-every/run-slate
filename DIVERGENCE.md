# DIVERGENCE.md

Where the planted shared documents (`AGENTS.md`, `BASELINE.md`, `AGENTS.consumer.md`, `CONTRACT.example.md`) and the shared schemas did not fit this seed, what was done instead, and what a later centralising pass should consider. Nothing here edits a shared document. Items 1 to 8 were recorded during the adversarial contract review of the product-planning contract and still stand; items 9 to 12 were recorded during the rewrite to the knowledge workspace spine on 8 September 2026, and items 13 and 14 during the adversarial review of that contract on the same day.

## 1. Two different clause formats in the shared docs

**Didn't fit.** `AGENTS.md` → "Contract and manifest" specifies a clause as a Markdown heading (`## CHAN-001 — Inbound email` with the sentence below it). `CONTRACT.example.md`, named as the quality bar, uses area headings with bolded-bullet clauses (`- **CHAN-001 — Inbound email.** …`). A seed cannot satisfy both.

**Did instead.** Followed the exemplar; `CONTRACT.md` is bulleted clauses grouped by area. `scripts/verify.mjs` parses `**ID —**`.

**For the shared docs.** Pick one and make `AGENTS.md` show it. The heading form also breaks the "one observable behaviour per clause" habit, because a heading invites a paragraph.

## 2. Contract prefixes can collide with baseline IDs

**Didn't fit.** `CONTRACT.example.md` uses `DATA-001` … `DATA-004` while `BASELINE.md` owns `BASE-DATA-001` … `BASE-DATA-005`. Every grep, report line, and coverage table for `DATA-003` matches both, and the bootstrap contract inherited this by using `DATA-` for portability.

**Did instead.** Renamed this seed's portability clauses to `PORT-001` … `PORT-006`, and added a verify check that no contract clause ID is a suffix of a baseline clause ID.

**For the shared docs.** Reserve the baseline area words (`ACCESS`, `INPUT`, `SECRET`, `DATA`, `PUBLIC`, `OPS`) as contract prefixes, lint it in seed-spec, and change the exemplar so it stops teaching the collision.

## 3. `BASE-DATA-002` has no room for single-use credentials

**Didn't fit.** "No user data is deleted automatically. Only sessions and rate-limit state expire." Invitations, sign-in links, and stored operation-key responses all expire in a normal product, and none of them is a session.

**Did instead.** Wrote WORK-006 so an invitation "can no longer be accepted" after 7 days (amended 16 October 2026 to match rer 0.2.25) and is retained rather than deleted, and SAVE-005 so an operation key is honoured for 24 hours. No baseline clause is superseded.

**For the shared docs.** Widen the clause to "sessions, single-use credentials, and rate-limit state expire", or say explicitly that expiry of a credential is not deletion of user data.

## 4. No "not applicable" state for baseline clauses

**Didn't fit.** `BASE-PUBLIC-001` and `BASE-PUBLIC-002` govern widgets, booking pages, forms, status pages, and embeddable surfaces. Slate intentionally ships the `HOME-001` public root at `/` (an owner identity plate until the 8 October 2026 amendment, a static landing page until the 13 October 2026 amendment, the shared Lobby since), but it is none of those public product surfaces. The reporting states are satisfied, overridden, or broken, so the honest outcome is still a vacuous test or a fake one.

**Did instead.** Declared the exact landing and sign-in paths in `seed.json → deploy.publicPaths`, and constrained the landing in `HOME-001` to no workspace records or member identity, no metrics, testimonials or pricing, no cookies or tracking, and no third-party resources. The 8 October 2026 amendment lets it describe the core-wiki product (the earlier no-marketing and no-feature-tour limits are replaced by a core-wiki-only claim limit), and the 9 October 2026 revision gives that description the owner's approved illustrated design with the same limits, drawn with Slate's card logo and no decorative tick lines. The same card mark is shown on the sign-in page and in the app and is the favicon, served from four declared same-origin static paths; the buyer-configured mark is gone. The 9 October 2026 `DOCS-001` amendment adds `/docs` and `/docs/<slug>` to the declared public paths (the landing's Docs link and "Read the guide" open `/docs`; "Read the setup guide" opens `/docs/install`): first-party documentation rendered at build time from the repository Markdown, under the same limits (no workspace records or member identity, no cookies or tracking, same-origin resources only, default-profile content only). The 13 October 2026 amendment moves the landing to the static run site (`run-slate.com`, its primary action "Run Slate" to `/run`, no sign-in links) and answers the installed `/` with Base's Lobby and `/setup/state`, which reveal only whether first-run setup is finished; `/setup/state` and `/brand/band.svg` join the declared public paths. Nothing is claimed as satisfied for the shared public-surface clauses.

**For the shared docs.** Add a declared not-applicable state, derived from the manifest (no qualifying public surface declared → `BASE-PUBLIC-*` reports as not applicable) rather than asserted by the seed.

## 5. The shared baseline test pack does not exist yet

**Didn't fit.** `BASELINE.md` states "Every clause has a test in the shared baseline pack that `rer verify` runs alongside the product contract." The pack is not planted with the doc, so the sentence is untrue in every seed today.

**Did instead.** `rer verify` reports baseline behaviour as `{satisfied: 0, planned: 22, sharedPackPresent: false}` instead of implying coverage.

**For the shared docs.** Ship the pack with the planted files, or phrase the sentence as a requirement on the released seed rather than a statement of fact.

## 6. `AGENTS.md` requires a test per clause, which a contract-first bootstrap cannot have

**Didn't fit.** "Every clause has at least one test tagged with its ID… A clause without a test fails validation." Bootstrap deliberately produces a contract before a backend.

**Did instead.** Every clause is tagged in `tests/e2e/contract-coverage.test.js` as an explicit TODO, and verify reports `productContractBehavior: {satisfied: 0, planned: 191}` so a green run cannot be read as a satisfied contract.

**For the shared docs.** Give seed-spec a `planned` state allowed only below a maturity threshold in `seed.json`, so pre-build honesty is expressible and publish still requires real tests.

## 7. `AGENTS.consumer.md` carries an exemplar clause ID in its worked example

**Didn't fit.** The override example is `{ "AI-002": { "reason": "AI replies must remain draft-only." … } }`, which is the support inbox's AI-002. In Slate, AI-002 is the AI run lifecycle and draft-only behaviour is AI-003 and AI-011, so the shipped buyer instructions point a buyer's agent at the wrong clause.

**Did instead.** Left the file untouched; it is a planted shared document and this is its defect, not Slate's.

**For the shared docs.** Use an obviously fictional ID (`EXAMPLE-001`) or add a per-seed replacement slot like the "About this product" line already has.

## 8. "Who may do X" policies push roles back into a no-roles product

**Didn't fit.** The exemplar marks `operator.management.v1` (who may invite or remove) and `conversation.can-delete.v1` (who may delete) as policies, while OPS-001 promises no roles. The bootstrap contract copied the pattern and grew to ten policies, including `comment.management.v1` (who may edit or resolve a comment).

**Did instead.** Removed `comment.management.v1` — authorship is ownership, not a role, so COMM-002 states the rule flatly — and folded `risk.plan-effect.v1` into `plan.health.v1`, which was the only policy that could contradict it. The spine rewrite dropped the rest of the planning policies with their clauses and stated the template-capture rule flatly. `operator.management.v1` was kept once more, for exemplar parity; the review of the spine contract rejected that, correctly. "Exemplar parity" is not a justification, the policy's own default restated an unconditional rule from the same clause, and nothing in it forbade a value that permitted removing the setup member or the last workspace owner — an authorisation check inside a customisation seam. It is gone: WORK-003 states who may invite and who may remove flatly, and says no policy value changes it. See item 11 for the count.

**For the shared docs.** Say in the extension-surface section that a policy answering "who may do X" needs a stronger justification than one answering "what should happen", and that two policies must never be able to decide the same question.

## 9. The SEED schema rejects the synthesis's own policy identifiers

**Didn't fit.** The accepted knowledge synthesis names two policies `record.pageParity.v1` and `page.publicAccess.v1`. `schema/SEED.schema.json`'s `extensionId` pattern is `^[a-z0-9]+(?:[.-][a-z0-9]+)*\.v[0-9]+$`, which is lower case only, so a manifest carrying either identifier fails validation. The other six divergence policies pass unchanged.

**Did instead.** Spelled both in kebab case, `record.page-parity.v1` and `page.public-access.v1`, in `CONTRACT.md` and `seed.json`. Every other name in the synthesis is used verbatim. The published policy identifiers are authoritative.

**For the shared docs.** The synthesis stage should be told the identifier form before it writes one — one line in the spine brief and in `research/README.md` — because the alternative is every spine's contract renaming its own policies after the fact. Widening the pattern to accept camel case would be the worse fix: two spellings of one identifier is how a lookup silently misses.

## 10. The seed now has a real public surface, and one baseline clause still does not fit it

**Didn't fit.** Item 4 recorded that `BASE-PUBLIC-001` and `BASE-PUBLIC-002` had nothing to govern in a product whose only public path was an identity plate. This spine publishes pages to the anonymous web (`WEB-001` to `WEB-007`), so `BASE-PUBLIC-001` is now genuinely in scope and is satisfiable: `WEB-003` sets no cookie, loads nothing third-party, and sends no visitor data before an interaction. `BASE-PUBLIC-002` still does not fit. It constrains embeddable surfaces to host origins listed in settings; a published page is not embedded anywhere, it is served on its own host, and an origin allowlist would either be vacuous or forbid the page from being read at all.

**Did instead.** Declared the published-page prefix in `seed.json → deploy.publicPaths`, wrote `WEB-003` to carry the privacy rules explicitly rather than by reference, and claimed nothing against `BASE-PUBLIC-002`.

**For the shared docs.** The declared not-applicable state item 4 asked for is still the answer, and it should be derived from the manifest: a seed that declares no embeddable surface reports `BASE-PUBLIC-002` as not applicable, while a seed that declares a public read surface must satisfy `BASE-PUBLIC-001`.

## 11. "About eight policies per seed" counts two different things

**Didn't fit.** `AGENTS.md` says about eight policies per seed, each for a customisation buyers are known to want. A spine contract has to carry one policy per divergence between its incumbents before it carries a single product policy, and this synthesis found exactly eight divergences. Read literally, the guideline says a spine may not have a product policy at all.

**Did instead.** Exactly eight, and they are the eight divergences. The rewrite first carried ten, adding `operator.management.v1` and `ai.usage-budget.v1`; the review of that contract cut both and it was right to. Neither earned a seam: `operator.management.v1` is a "who may do X" policy whose default restated an unconditional rule from the same clause (item 8), and `ai.usage-budget.v1` named no second value, so it was a rule wearing a policy label and any replacement value would have defeated `AI-012`'s own refusal guarantee. Both rules are now stated flatly, in `WORK-003` and `AI-012`, alongside `TMPL-005`'s template-capture rule which was settled the same way. A rule that can be written down should be written down rather than made a decision a buyer has to take. The count is now the divergence count, the guideline, and the synthesis's own number at once, so the collision the item was written about no longer bites this seed — but it will bite the next spine whose matrix has nine divergent rows.

**For the shared docs.** Say that the guideline counts product policies, that a spine's divergence policies are counted separately and are bounded by its matrix, and that the plan's falsifier — a synthesis needing policies well past eight — is about the divergence count alone. CENTRALISE also asks for a per-policy justification in `seed.json`, and there is nowhere to put one: `SEED.schema.json`'s `extensionPoints` is `additionalProperties: false` over arrays of strings. Either give each extension point an optional object form with a `why`, as `env` and `externals` already have, or drop the ask; today the justification can only live in prose no tool reads.

## 12. The importer seam base left open is settled here

**Didn't fit.** The original shared guide left an open seam: `AGENTS.consumer.md` tells the owner's agent that `seed.json` names the importer for each product the seed replaces, but `replaces[]` carries only `{name, edition}`, and whether the importer arrives as a field there or as a contribution ID the agent can look up was left to the first spine's contract. This is that contract.

**Did instead.** Neither. An importer is a clause with a test — `IMP-002` for Notion, `IMP-003` for Confluence — inside the `importers` capability in `seed.json`, and `replaces[].name` implies it. A guarantee belongs where `rer verify` can report it satisfied, overridden or broken; a manifest field naming an importer would duplicate the clause and could drift from it, and a contribution ID would say the importer is optional when the plan makes it a condition of the name appearing in `replaces` at all.

**For the shared docs.** Change the sentence in `AGENTS.consumer.md` to point the owner's agent at the `importers` capability and its clauses rather than at `replaces[]`.

## 13. `BASE-INPUT-003` forces a download disposition on content built to be displayed

**Didn't fit.** The baseline requires every upload be "served with their declared
content type and a download disposition". A page body carries inline images, video
and audio (`BLOCK-008`), a page carries an icon and a cover (`PAGE-006`), and a
published page renders both to an anonymous reader (`WEB-003`). A download
disposition makes all four impossible. This is CENTRALISE Tier-2 item 9 verbatim,
it is hit by four repositories, and it is live in this seed the moment the page
exists.

**Did instead.** Superseded the baseline clause narrowly rather than working around
it. `BLOCK-008` names `BASE-INPUT-003`, supersedes its disposition and nothing
else, and splits display from attachment: a file requested for display is served
inline, every other request for a stored file is served with a download
disposition, both send the declared content type and `nosniff`, an SVG is
sanitised under `BASE-INPUT-002` first, and access is unchanged either way. The
contract header names the supersession, and `BLOCK-008` carries the test, so
`rer verify` will report `BASE-INPUT-003` as superseded rather than broken.

**For the shared docs.** Split the baseline clause: storage, type and size limits,
and the access rule are one clause every seed satisfies; disposition is a second
clause that says a product contract names which of its uploads are displayed. Any
seed with an avatar, a logo or an inline image supersedes the current wording, so
four repositories supersede a security clause for a reason that is not a security
difference.

## 14. `RELEASE.schema.json` has no first-release form for `contractChanges`

**Didn't fit.** `contractChanges` is required and is described as "every clause
whose meaning this release adds, changes, or removes". On a first release every
clause is an addition, so the literal reading is one entry per clause — 191 here —
each restating a sentence the reader already has in `CONTRACT.md`, and none of them
telling an owner anything, because there is no earlier meaning to have changed. The
schema already reasons the other way for `proseChanges`, which it says to omit on a
first release "where the owner receives every document new".

**Did instead.** `RELEASE.json` carries one entry, `BLOCK-008`, and it is there for
its `supersedes` rather than for its addition: displacing a `BASELINE.md` clause is
the one thing in this release that changes what an owner could otherwise rely on.
`agentUpdateInstructions` states that this is the first release, that every clause
is new, and that the fifty retired IDs were never published.

**For the shared docs.** Say the same thing for `contractChanges` that the schema
already says for `proseChanges`: on a first release it records supersessions of
baseline clauses and nothing else. Otherwise every seed's first `RELEASE.json` is
either a duplicate of its contract or quietly wrong.

## 15. `IMP-003` named the XML space export; Confluence Cloud emits CSV tables (11 September 2026)

**Didn't fit.** The accepted clause said Slate "imports a Confluence space export in
its XML form". The space export the owner actually produced from
`workspace.example.com` on 11 September 2026 contains no `entities.xml`. Confluence
Cloud writes one CSV file per database table at the archive root — `content.csv`
(the tree, content types, `version`, `prevver`, `content_status`, `parentid`,
`child_position`), `bodycontent.csv` (storage-format XHTML bodies), `content_label`,
`label`, `content_permissions`, `contentproperties`, `links`, `spaces`,
`user_mapping`, the `AO_*` app tables, `whiteboards/data/whiteboardExport_1.csv`, and
`exportDescriptor.properties` — and it names them `*.csv.gz` and
`exportDescriptor.properties.gz` while writing them uncompressed. A parser built to
the clause as accepted would have rejected the incumbent's own export.

**Did instead.** Amended `IMP-003` by the minimum wording so it names whichever form
the product emits, and kept both: `src/core/features/imports/confluence/space.ts`
reads the Cloud CSV tables and `confluence/xml-space.ts` keeps the Server and Data
Center `entities.xml` path, with `confluence/index.ts` choosing on the archive's
shape. The Cloud path is the one tested against a real export
(`tests/e2e/imports/real-exports.test.ts`); the XML path keeps only its synthetic
test in `tests/e2e/imports/parsers.test.ts` and has never been run against an export
Confluence produced. No `RELEASE.json` entry was added: `IMP-003` has never been
published, and item 14 above settles that a first release records supersessions only.

**For the shared docs.** A clause that names a file format is a bet on an incumbent's
current exporter. Contract wording should name the product and the round trip, and
leave the wire form to the fixture — otherwise every incumbent's next export format
change is a contract change.

## 16. Shared identity with native accounts — owner decision, 10 October 2026

The approved COMMON-LOGIN phases 1–4 supersede the 8 October implementation
exemption. Slate retains **own accounts, sessions and roles**, including its
existing member IDs, group memberships and scoped guests. Base owns the intended
identity proof and dependency protocols. No second owner or operator ledger is
introduced. WORK-008, WORK-009, WORK-010 and WORK-015 remain binding.

Base operator-auth now signs Slate in. The copied Base modules are byte-exact at
`9ec15a63a410d209cd5a179749336bb61751e0f6`. `src/core/features/session/native/`
supplies Base's paired native accounts and proof adapters over Slate's own
`members`, `sessions` and `member_identity_bindings`; the service never creates
Base account or session tables. Admission, proofs and owner lookups are scoped to
the installation's workspace, selected by the server. Member IDs, owner/member
roles, groups, scoped guests and the `slate_session` cookie are unchanged.

- **Email (BASE-ACCESS-001).** `POST /api/auth/magic` asks Base for a one-use
  link (one hour, keyed digest only). GET `/auth/confirm` previews; a same-origin
  POST consumes the proof and issues a 30-day native session in one D1 batch that
  rechecks the member's status, email and authority version. Links sent before
  this release, by either earlier engine, show the request-new-link page.
- **Incumbent provider (WORK-015).** Base's `legacy-rs256` preset keeps the
  configured issuer, client and the registered `/api/auth/identity/callback`, and
  adds exact HTTPS pins for the authorization, token and JWKS endpoints. The first
  provider sign-in binds the issuer/subject to the member whose verified mailbox
  it presents; a binding never moves to another member. Provider sessions last at
  most 24 hours and end when the provider configuration or its pin changes.
- **Authority (WORK-008/009/010).** `member_authority` advances on any email,
  role, kind, status or ownership change. Sessions issued from now on, and every
  pending proof, are fenced at that version. Sessions from before this release
  keep their existing contract: valid until expiry, revocation or removal, with
  the member's current role read on every request. Nobody gains authority.
- **Step-up.** Workspace export, restore, permanent deletion, ownership changes,
  owner removal or erasure, agent credentials and connectors need a Base email
  proof from the last ten minutes in the asking session. Without one, Slate emails
  the member a confirmation link and refuses the attempt; the commit repeats the
  proof check.
- **Dev identity (SC-05).** The local-only entry `src/dev/server.ts` serves
  key-gated dev sessions for the claimed owner and real `editor` and `guest`
  personas at `<as>@dev.localhost`. The outbox answers only with the checkout's
  dev key. Archives exclude sessions and restore every non-owner member inactive.

Slate has no domain rules, passwords or linked dependency providers, so Base's
domain, password-revocation and dependency logout/fence paths have no Slate flow;
those service methods refuse as Base specifies. Invitation acceptance remains
Slate's native account administration.

## 17. The homepage names what Slate replaces — owner decision, 12 October 2026

**Didn't fit.** The landing test refused every percentage in the page copy and the platform's naming rule kept
incumbent names off homepages (OD-16). Search and a switching buyer both need one plain line that says what Slate
replaces.

**Did instead.** The hero carries one line under the subhead, "100% free, open source alternative to Notion,
Confluence and Guru" (`src/core/features/landing/copy.ts`), and the same sentence ends the page's meta description
(`src/routes/index.tsx`). `seed.json` `replaces` adds Guru beside Notion and Confluence. Guru has no dedicated
importer; this is a nominative "alternative to" name, not an import claim. `tests/e2e/landing.test.ts` now allows
exactly that line's "100%" and the three names, and still refuses any other percentage, price or count and any
comparative claim ("better than", "unlike", "instead of", "beats", "versus"). The owner chose this on 12 October 2026,
reversing OD-16 for homepages.

## Deployment input validation

Slate selects `resend` or `sendgrid` explicitly with `SLATE_MAIL_PROVIDER` and uses `SLATE_MAIL_API_KEY` for either selection. `scripts/installer/deploy.mjs` writes the selected provider and sender into the Base deploy-kit declaration. OPERATIONS.json records the actual account/token and native secret inputs. Local validation checks syntax and command availability; provider identity, delivery and deployed health require separate evidence.
