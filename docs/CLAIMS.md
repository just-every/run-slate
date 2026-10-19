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

| TREE-005 | done | Named tree-footer, child and global creation preserve exact placement and persist after reload; read-only readers get no writable destination. `tests/e2e/navigation/create-in-place.test.ts`, `tests/qualification/ui-convergence/create-in-place-journey.mjs` at 1440/390. | None. |

| PAGE-012 | done | Shared typeface, small text and full width persist without changing blocks. Markdown, HTML and PDF readable archives re-import with those settings; complete workspace export restores them. `tests/e2e/pages/display-options.test.ts` and 1440/390 editor/reader, exported HTML and re-import journeys in `tests/qualification/ui-convergence/page-display-journey.mjs`. | None. |

| PAGE-014 | done | Page and comment reactions identify the member, add and remove independently and persist; read-only readers can react, denied readers cannot; reactions create no notifications or analytics views. `tests/e2e/pages/reactions.test.ts`, `tests/qualification/ui-convergence/reactions-journey.mjs` at 1440/390. | None. |

| PAGE-013 | done | Page and space daily views and unique viewers, permitted reader/contributor identities, explicit author-view counts and inclusive UTC date filters; panel navigation adds no visit. Draft/private-page exclusions, guest identity boundaries and revoked access are exercised by `tests/e2e/pages/analytics.test.ts`; `tests/qualification/ui-convergence/analytics-journey.mjs` covers reader and space surfaces at 1440/390. | None. |

No hosted mail delivery or unrun browser acceptance is claimed here.

| PAGE-011 | done | Full-screen read-only presentation split by top-level headings; long slides retain controls, previous/next and keyboard navigation, no-heading/empty pages and exact scroll/focus return. `tests/e2e/pages/presentation.test.ts` and `tests/qualification/ui-convergence/presentation-journey.mjs` at 1440/390. | None. |

| PORT-008 | done | Readable page, subtree, space and workspace exports preserve page/inline threads with authors, times, replies, resolved states, tombstones and block anchors. HTML renders discussions with block links; Markdown includes JSON sidecars. Fresh imports retain historical authors and remap anchors without notifications. `tests/e2e/imports/readable-comments.test.ts`; 1440/390 export/read/re-import journeys in `tests/qualification/ui-convergence/export-comments-journey.mjs`. | None. |

| EMBED-003 | partial | Allowlisted click-to-load design, video and document frames, provider-specific CSP/sandbox, current read checks, public revocation and no provider contact before interaction; `tests/e2e/editor/provider-embeds.test.ts`, `tests/qualification/ui-convergence/provider-embeds-journey.mjs` at 1440/390 with provider-edge fixtures. | Automatic cross-origin refusal detection/link-card fallback and live provider acceptance. |

| BLOCK-014 | done | Header rows and columns, stored widths, cell colours, rectangular merges that retain covered cells, sorting, keyboard structure editing, quoted spreadsheet paste and atomic table/database conversion that keeps database edits. Worker rules: `tests/e2e/editor/tables.test.ts`; 10 × 20 paste, editing, conversion, shortcuts and published views at 1440/390: `tests/qualification/ui-convergence/tables-journey.mjs`. | None. Independent release acceptance remains separate. |

| ADMIN-003 | done | Owner guest console, access/inviter/activity/expiry, default expiry, exact domain lists, owner-set guest-wide deadlines and bulk revocation ending sessions. HTTP proof, including expired authored drafts and existing guests, in `tests/qualification/policies/invitations.test.ts`; 1440/390 UI proof in `tests/qualification/ui-convergence/guest-console-journey.mjs`. | None. Independent release acceptance remains separate. |

| ADMIN-004 | done | Seven aggregate reports, UTC filters, per-container ownership and current page permissions, identity-free no-result counters, and CSV. `tests/e2e/pages/analytics.test.ts`; all report screens and downloads at 1440/390 in `tests/qualification/ui-convergence/analytics-journey.mjs`. | None. Independent release acceptance remains separate. |

| DB-015 | done | Record templates with default fields and a body; daily, weekly-on-days, monthly and yearly schedules in the creator's time zone; one record per occurrence across restarts; a paused schedule shows its reason when its creator loses access. `tests/e2e/databases/record-templates.test.ts`. | None. Independent release acceptance remains separate. |

| TMPL-007 | done | Eleven shipped starter templates in every workspace from the first sign-in, by category, with previews, task-ready meeting notes, a product-requirements task report and issue section, and duplicates that leave the shipped template unchanged. `tests/e2e/pages/starter-templates.test.ts`; gallery, preview, creation, assignment and duplication at 1440/390 in `tests/qualification/ui-convergence/starter-templates-journey.mjs`. | None. Independent release acceptance remains separate. |
