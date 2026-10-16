# Slate release profiles and retained full flagship acceptance

## Core-wiki launch gate (6 October 2026 amendment, 6 October 2026)

The release scope is a separately labelled core-wiki candidate. The default
`SLATE_PROFILE=core-wiki` disables flagship UI/API entry points, co-editing sockets
and intelligence/federation dispatch; it preserves stored data and migration
history. The precise scope is in CONTRACT.md. All eight content policies and
all applicable baseline requirements remain binding. `flagship` is an explicit
configuration opt-in, not evidence of acceptance or a release recommendation.

The launch gate requires the original `rer verify` assertions without weakening, plus the core,
portability, search and publication qualification suites from a clean clone;
Publication relocation and erasure regressions, including actual erased-filename export → fresh
restore → re-export; the sealed prior-store upgrade/recovery run; and repeated
cross-runtime console-error checks. It also requires real edition/source-lock/
RER files, operations describe/check, publish-check, resource footprint and plan
tier documentation. An exact-candidate rc tag requires separate authorization;
source verification alone does not authorize publication or deployment.

The 7 October 2026 test prerequisites include additive measured-route test
prerequisites while retaining the original unmeasured fixture and refusal tests.
Competing-reservation fixtures use distinct intents because identical work
coalesces; the original budget and assertions stay intact, and a separate
same-intent check retains that input's one-run/one-reservation coverage.
`pnpm test:release-regressions` executes publication relocation, erasure and a real emitted-Worker browser
console regression. Main CI runs it after `rer verify` with headless Chromium.
Passing this command does not satisfy the full flagship or external-provider gate.

Profile tests must exercise the default UI/API refusal and explicit opt-in,
normal page editing/search/publication/import/export availability, retained
migration history and queued-work refusal. A profile test is bounded evidence,
not proof of the remaining core journeys. Existing tests and fixtures stay intact.
No live provider call is required merely to select core wiki; no real-export,
provider, deployment or prospective-value proof may be replaced by fixtures.

## Shared identity with native accounts — owner decision, 10 October 2026

The approved COMMON-LOGIN phases 1–4 supersede the 8 October implementation
exemption. Slate retains **own accounts, sessions and roles**, including its
existing member IDs, group memberships and scoped guests. Base owns the intended
identity proof and dependency protocols. No second owner or operator ledger is
introduced. WORK-008, WORK-009, WORK-010 and WORK-015 remain binding.

Base operator-auth now signs Slate in. The copied Base modules are byte-exact at
`363da337fe618bfc62fa3b6b5fd3e7f2f67d5879`; the original
`9ec15a63a410d209cd5a179749336bb61751e0f6` proof pin remains historical evidence. `src/core/features/session/native/`
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
  personas at `<as>@dev.localhost`. The printed `RER_OPEN` link admits the
  native local owner session through the checkout's dev-key gate. Local mail is
  silently suppressed; no captured-mail page is served. Archives exclude sessions
  and restore every non-owner member inactive.

Slate has no domain rules, passwords or linked dependency providers, so Base's
domain, password-revocation and dependency logout/fence paths have no Slate flow;
those service methods refuse as Base specifies. Invitation acceptance remains
Slate's native account administration.

The following full flagship requirements remain unchanged except for FLAG-001's
explicit separate launch gate. Full acceptance remains pending; core-wiki
qualification must never be reported as full flagship qualification.

## Retained flagship scope

The owner accepted the complete flagship and sustained-inquiry implementation on
27 September 2026. [CONTRACT.md](CONTRACT.md) now contains 221 requirements:
191 inherited IDs (14 explicit amendments), 29 flagship additions and the
separate `DOCS-001` public-documentation addition. All 22
[baseline obligations](BASELINE.md) remain. STAT-003/004 and all eight policy
clauses and their values remain unchanged. [RELEASE.json](RELEASE.json) records
exact old/new wording. See HANDOVER.md for current source verification limits.

This document establishes requirements, not acceptance. The captured foundation
baseline was 0/191 product clauses and 2/22 baseline clauses satisfied. New code,
a contributor's report, passing local unit tests and an operations description
cannot advance maturity. The release maintainer independently runs and inspects the
semantic checks and records exact artifact, date, environment and limits.

## Full gate

All 221 current clauses, 22 baseline obligations and every policy value must have
observable evidence. The original BLOCK-008 disposition-only supersession of
BASE-INPUT-003 remains; storage, size, type and access obligations remain intact.
The full [delivery scope](FLAGSHIP-DELIVERY.md), [six journeys](USER-JOURNEYS.md)
and [sustained-inquiry loop](FRONTIER-EXTENSION.md) are required together. A
minimum useful subset is not a waiver. Preserve accepted collaborative UI,
responsive editing and every inherited product requirement.

| Journey | Required observable outcome |
| --- | --- |
| 1. Useful answer before setup | Outcome request over already permitted sources yields a useful exact-cited result without schema/model/claim/agent chores; missing authority goes once to its named owner. |
| 2. SSO inquiry and separately authorized work | Inquiry has no account/charge effect; prices, intervals, discount scope/expiry and account freshness stay explicit. Separate consent, commercial approval, paid entitlement and exact grant produce one confirmed activation; pending setup is not enabled. Article repair has independent authority. |
| 3. Hard question through learning | Rival hypotheses, falsified initial explanation, useful interim finding, reproducible analysis, predeclared comparison/window/precision/guardrails, real exposure/receipts and benefit/null/adverse/inconclusive classification revise an evaluated reusable method. |
| 4. Policy decision and consequences | Read-only dependency/exception rehearsal, collaborative immutable acceptance, granted determinate repairs, evaluated skill revision and coalesced outcome preserve unaffected exceptions. |
| 5. Colleague completes real work | Prepared contextual procedure uses live source authority and actual task effects, retaining sources, checks, receipts and reusable owner-controlled learning. |
| 6. Contradiction or failed effect | Scope/authority conflicts and uncertain writes remain honest; reconcile without duplication, preserve prior confirmed work, route only the true decision and stop/revoke safely. |

## Evidence layers

1. **Local implementation:** real Worker/D1/R2 and browser flows, concurrent edits
   and suggestions, access/session matrices, all policy values, restart/durable
   pause, ten-minute stage timeout, budgets, stale inputs, grant revocation,
   source-audience fan-in and later reads, connector disconnect/reconnect,
   schema failure, cancellation and ambiguous effects. Existing tests/fixtures
   remain unchanged. Tests may isolate providers; those cases prove only local
   semantics, never live provider behavior.
2. **Data and owner portability:** genuine Notion/Confluence/Word/Google Docs
   exports, explicit unsupported-construct reports, persistent import rollback,
   search rebuild, complete export/restore including source/claim/skill/run/
   inquiry/effect/interface lineage, inactive restored actors and unpublished
   public links. Verify existing 0001 data forward through additive migrations
   without rewriting applied history; verify recovery and customized-owner code.
3. **Provider acceptance:** genuine authorized document, collaboration/evidence
   and operational accounts, multiple real connector families, exact identities,
   scopes and source ACLs, receipts/read-back, outage/partial-index/freshness and
   revocation. A local Codex bridge is a local inference option, not hosted
   inference. Missing credentials or unsupported guarantees remain unavailable.
4. **Product and release:** clean install, actual source/license custody,
   generated design versus running UI comparison, accessibility, touch and load
   measurements, deployment/recovery commands and emitted Worker dispatch.
   Deployment/tagging requires separate authority and independently verified
   artifact; no local report is proof of release or remote health.
5. **Sustained empirical value:** held-out cases frozen separately from training/
   development examples, decision-time cutoffs without future-outcome leakage,
   prospective windows that actually elapse, expert/current-tools and capable
   generic-agent comparisons over identical accessible sources/tools. Measure
   discovery, falsification, missed-important-event recall (including low-score
   audits/frontier sweeps), reproducibility, forecast/intervention outcomes and
   all-attempt costs, elapsed time, setup, every person's attention and repair.
   Null requires precision to rule out the meaningful effect; otherwise report
   inconclusive. Repeated work must preserve quality and demonstrate savings.

Zero tolerance applies to unauthorized reads/effects, revoked-source disclosure,
lost/duplicated mutations, falsely approved policy and silently moved citations.
Simulation never counts as live effect proof. Human Verified still requires a
human opening the exact revision; no freshness check renews it. Source credentials
and grants cannot override HappyToHelp/Orbit ownership or exact-human-send rules.
`app.happytohelp.com` remains live production and no other edition is replaced.

## Current evidence status

Contract/operating-description consistency checks are local authoring evidence
only. Full product, genuine-provider, prospective inquiry and release evidence
remain pending independent release acceptance. Record missing prerequisites by named
owner, exact scope and effect; do not replace them with fixtures or mark complete.
