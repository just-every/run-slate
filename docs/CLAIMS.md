# Current contract evidence

Status describes implementation progress, not full acceptance. CONTRACT.md is the complete clause register.

| Clause | Status | Proven behaviour | Remaining gap |
| --- | --- | --- | --- |
| BLOCK-016 | partial | Native task reports, per-reader filtering, completion and readable archive behaviour; `tests/profile/work-items-journey.ts`. | Confluence Task Report mapping, anonymous public queries and unresolved external scope identities. |
| BLOCK-017 | partial | Body contents links and heading updates; `tests/profile/body-blocks-journey.ts`. | Word export and genuine Confluence macro-fixture acceptance. |
| BLOCK-018 | partial | Inline native status labels, editing and readable archive mapping; `tests/profile/body-blocks-journey.ts`. | See CONTRACT.md for remaining import and export gaps. |
| STAT-006 | done | Named and group requests, inbox and queues, exact-open verification, native change comments, reassignment, cancellation and bulk review. Scheduled Workers cover permissions, reminders, owner escalation, deduplication and revoked access in `tests/e2e/review/verification-flow.test.ts`; a 1440/390 browser journey requests, queues, opens and verifies a review and fires the Worker cron for one reviewer reminder and one owner escalation in `tests/qualification/ui-convergence/review-request-journey.mjs`. | None. |
| PAGE-015 | partial | Native lock banner, read-only second editor, open comments, refused API and automation writes, unlock/edit and activity; `tests/profile/page-lock-journey.ts`. | A lock racing a staged import commit is fenced but does not yet guarantee the PAGE_LOCKED error. |

No hosted mail delivery or unrun browser acceptance is claimed here.
