# Main CI observation

Initial main was 93b7327adee97ac0ff691bfb5cbff68f4412a27a. Exact-head Verify runs 42144247270 and 42140210059 and Run site 42144247238 completed successfully. Later Verify 42150976860 completed with failure in tooling job 127674495791 at Workers, public-door journeys and suite; its aggregate job 127681168765 failed as a dependency. The app, core and both UI focus shards succeeded.

The required single log command was run once:

`gh run view 42150976860 --repo just-every/run-slate --job 127674495791 --log-failed`

Observed command exit: 0. Observed stdout and stderr: empty (zero bytes). No failing assertion or transport response was supplied. No speculative repair, archive retry, CI dispatch or rerun was made. The failure is unclassified; earlier exact-head successful runs are recorded separately, not substituted for candidate CI.
