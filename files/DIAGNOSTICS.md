# Local diagnostics

The first existing shared-page registration attempt, before the candidate's added helper was loaded, completed its preceding synced-content scenarios and failed while starting the next native installation:

Command: node --test --test-name-pattern='shared page invitations' tests/qualification/ui-convergence/journeys.test.mjs
Result: exit 1, Error: listen EADDRINUSE: address already in use 127.0.0.1:39843.

No production fix was made for this transport failure. Final browser commands use dedicated explicit application and inspector ports below the operating system's ephemeral range and run sequentially.

The first provisional new-helper run reached the edit member's direct body insertion and failed its duplicate comparison because the browser's real pages.open activity arrived during the comparison. The stored mutation, version and content were otherwise consistent.

Failure: AssertionError: A repeated page edit changes no retained inventory.
Distinct added event: action=pages.open, actor=browser-reader, revision equal to the just-committed pages.blocks.replace revision.

The helper was corrected to wait for the browser's actual read receipt before freezing the duplicate baseline. It retains the read event in the complete activity inventory. No production authorization, timing window, request limit or assertion was relaxed. The corrected provisional run then passed all four levels, including 116 unchanged-state refusals. That provisional run predates the final metadata-read assertions and is not the final candidate receipt.

No failed GitHub assertion was repaired in this round. No workflow, dependency or Base pin was changed.
