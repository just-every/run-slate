# Current contract evidence

Status describes implementation progress, not full acceptance. CONTRACT.md is the complete clause register.

| Clause | Status | Proven behaviour | Remaining gap |
| --- | --- | --- | --- |
| BLOCK-016 | partial | Native task reports, per-reader filtering, completion and readable archive behaviour; `tests/profile/work-items-journey.ts`. | Confluence Task Report mapping, anonymous public queries and unresolved external scope identities. |
| BLOCK-017 | partial | Body contents links and heading updates; `tests/profile/body-blocks-journey.ts`. | Word export and genuine Confluence macro-fixture acceptance. |
| BLOCK-018 | partial | Inline native status labels, editing and readable archive mapping; `tests/profile/body-blocks-journey.ts`. | See CONTRACT.md for remaining import and export gaps. |
| STAT-006 | done | Named and group requests, inbox and queues, exact-open verification, native change comments, reassignment, cancellation and bulk review. Scheduled Workers cover permissions, reminders, owner escalation, deduplication and revoked access in `tests/e2e/review/verification-flow.test.ts`; a 1440/390 browser journey requests, queues, opens and verifies a review and fires the Worker cron for one reviewer reminder and one owner escalation in `tests/qualification/ui-convergence/review-request-journey.mjs`. | None. |
| CONT-010 | partial | Space blogs: dated, attributed posts with covers and comments; permission-aware space and Home feeds; one `post-published` notice per follower; `tests/flagship/discovery/blog.test.ts`, `tests/qualification/ui-convergence/blog-journey.mjs`. Confluence Cloud blog posts import with their dates and authors in `tests/e2e/imports/blog-posts.test.ts`. | Genuine incumbent export with blog posts, Server/DC XML blog posts, and email delivery under NOTIF-005. |
| SAVE-002 | done | Real Worker refusals leave committed title and blocks unchanged; rejected title drafts remain visible with a named failure and explicit retry, including corrected retries and reload at 1440/390. `tests/e2e/saving/failed-writes.test.ts`, `tests/qualification/ui-convergence/failed-save-journey.mjs`. | None. |
| TREE-004 | done | Per-space title filters, readable ancestors, matching within 200ms and one-action clear without changing saved expansion; mobile drawer remains open for filtering and closes on navigation. Worker access/expansion checks and 1440/390 browser journeys: `tests/e2e/navigation/tree-filter.test.ts`, `tests/qualification/ui-convergence/tree-filter-journey.mjs`. | None. |
| PAGE-015 | done | Native lock banner, read-only second editor, open comments, refused API and automation writes, unchanged grants, unlock/edit and activity; `tests/profile/page-lock-journey.ts`, `tests/qualification/ui-convergence/page-lock-journey.mjs` at 1440/390. Staged-import races return PAGE_LOCKED without masking an intervening edit: `tests/e2e/imports/page-lock.test.ts`. | None. |

| NAV-005 | done | Global Create on every configured operator destination; page, database, space and template creation with named destinations, writable database choices, categorized templates visible with no category filter, and server authorization. `tests/e2e/navigation/global-create.test.ts`, `tests/qualification/ui-convergence/global-create-journey.mjs` at 1440/390. | None. |

| TREE-003 | done | Named Shared with me navigation for individual page grants in non-member spaces; current membership, expiry and revocation, unreadable-neighbour exclusion, exact page opening and first-load removal. `tests/e2e/navigation/shared-navigation.test.ts`, `tests/qualification/ui-convergence/shared-navigation-journey.mjs` at 1440/390. | None. |

| PAGE-010 | done | Heading edits appear within two seconds; entries navigate to their headings, survive reload and disappear with the last heading. Long labels wrap. `tests/qualification/ui-convergence/outline-journey.mjs` at 1440/390. | None. |

No hosted mail delivery or unrun browser acceptance is claimed here.
