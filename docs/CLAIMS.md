# Current contract evidence

Status describes implementation progress, not full acceptance. CONTRACT.md is the complete clause register.

| Clause | Status | Proven behaviour | Remaining gap |
| --- | --- | --- | --- |
| BLOCK-016 | partial | Native task reports, per-reader filtering, completion and readable archive behaviour; `tests/profile/work-items-journey.ts`. | Confluence Task Report mapping, anonymous public queries and unresolved external scope identities. |
| BLOCK-017 | partial | Body contents links and heading updates; `tests/profile/body-blocks-journey.ts`. | Word export and genuine Confluence macro-fixture acceptance. |
| BLOCK-018 | partial | Inline native status labels, editing and readable archive mapping; `tests/profile/body-blocks-journey.ts`. | See CONTRACT.md for remaining import and export gaps. |
| STAT-006 | partial | Named and group requests, inbox and queues, exact-open verification, native change comments, reassignment, cancellation and bulk review. Browser journeys covered both widths; scheduled Workers cover reminders, owner escalation, deduplication and revoked access in `tests/e2e/review/verification-flow.test.ts`. | Timed browser escalation acceptance remains unproven. |
| PAGE-015 | partial | Native lock banner, read-only second editor, open comments, refused API and automation writes, unlock/edit and activity; `tests/profile/page-lock-journey.ts`. | A lock racing a staged import commit is fenced but does not yet guarantee the PAGE_LOCKED error. |
| CONT-010 | partial | Published-snapshot post feeds, actual publication dates/authors, follower notices and Confluence metadata have HTTP/import evidence in `tests/profile/homes-posts-journey.ts` and `tests/e2e/imports/parsers.test.ts`. | WIP: native browser acceptance and genuine Confluence blog fixture remain unproven. |
| CONT-011 | partial | Space-home and company-hub configuration, new-member HTTP access, private-link filtering and erased historical IDs have HTTP evidence. | WIP: native browser acceptance remains unproven. |
| TMPL-007 | partial | Eleven protected, categorised starter scaffolds, actual task/report blocks and typed policy review dates are implemented. | WIP: prepared browser journey has not run; authentic issue embeds and checked runbooks remain missing. |

No hosted mail delivery or unrun browser acceptance is claimed here.
