# Operative setup and run commands

All commands execute in the one owned clone, /home/agent/rer-consolidation/work/sd-slate190-ci-triage-1/run-slate, unless noted. No diagnostic GitHub REST/gh calls, product commits/pushes, CI polling/reruns/dispatches or publication scans occur. The mandatory launcher separately invoked gh auth status once; its internal HTTP count was not observed. Read-only inspection commands are not test executions.

Fleet global identity was configured first (exit 0):

    git config --global user.name 'Run Edit Run fleet' && git config --global user.email fleet@runeditrun.com

Launcher setup used the already-present /workspace/rer-cloud-launcher/refresh.sh (exit 0), then installed the task-specified decrypted-bundle Git credential helper and removed credential-bearing GitHub rewrites (exit 0; removed 0). No credential value is in this packet. The task-side product push guard and separate evidence entrypoint were installed outside the product tree. The evidence entrypoint additionally checks all evidence candidate identities/trailers before its report-only push.

The actual clone/ref commands (all exit 0) were:

    git clone --depth 1 --filter=blob:none https://github.com/just-every/run-slate.git /home/agent/rer-consolidation/work/sd-slate190-ci-triage-1/run-slate
    git config user.name 'Run Edit Run fleet'
    git config user.email fleet@runeditrun.com
    git switch -c cloud/sd-slate190-ci-triage-1 origin/main
    git fetch --depth=1 origin ca90559bbd29bca4e0d86329d384e81a68289481
    git fetch origin main
    git switch --detach ca90559bbd29bca4e0d86329d384e81a68289481
    git fetch --depth=1 origin 03e7b8a3f2ebace8330a11b03ce868026efdecda

The supplied /tmp/rer-cloud-toolchain.sh was created and sourced in every fresh setup/build/test shell. Its cloud_run function invokes python3 /tmp/rer-reap.py (PR_SET_CHILD_SUBREAPER), waits for the actual command and reaps its descendants. The task-specified local commit hook preserves repository hooks and removes OpenAI/Codex co-author lines; no product commit is made.

Candidate dependency install (exit 0, pnpm-reported 8.9s):

    . /tmp/rer-cloud-toolchain.sh
    pnpm install --frozen-lockfile

The supplied toolchain used newer Node 24.19.0 for this dependency install. To match CI's runtime exactly, Node 22.20.0 was installed outside the clone (exit 0):

    timeout 300 npm install --prefix "$HOME/.rer/toolchain/node-22.20.0" --no-audit --no-fund node@22.20.0

The common prefix for setup, build and every test on each head is:

    . /tmp/rer-cloud-toolchain.sh
    export PATH="$HOME/.rer/toolchain/node-22.20.0/node_modules/node/bin:$PATH"
    export SLATE_CHROMIUM_PATH=/usr/bin/chromium

All setup/build/test command arguments, exact head SHAs, start/end UTC times, exit codes and total wall durations are in commands.jsonl. All actual stdout/stderr is in the corresponding <label>.log files. record.py only invokes the command, captures stdout/stderr and appends a receipt; it changes no application/test configuration.

Setup and build each ran via cloud_run's exact subreaper implementation:

    python3 ../record.py candidate-setup python3 /tmp/rer-reap.py npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive
    python3 ../record.py candidate-build python3 /tmp/rer-reap.py npx -y @runeditrun/rer build

The two Workers cases each use the root vitest.config.ts. They are run as separate ordinary commands, sequentially, with full existing registration bodies and existing deadlines:

    cloud_run python3 ../record.py candidate-automation pnpm exec vitest run tests/flagship/structured/automation-repairs.test.ts --testNamePattern '^automation admission, resumed effects and schedules preserve current scope and exactly-once recovery$' --reporter=default
    cloud_run python3 ../record.py candidate-chat pnpm exec vitest run tests/e2e/notifications/destinations.test.ts --testNamePattern '^CHAT-001 — Owners connect several chat destinations, each with its own event selection, and every destination sends one link-only message, fails and disconnects on its own$' --reporter=default

The single browser registration uses CI's actual partition mapping and the existing system-Chromium override:

    SLATE_UI_SHARD=1/8 SLATE_UI_ASSIGNMENTS=.github/scripts/journey-shards.json cloud_run python3 ../record.py candidate-mobile node --test --test-concurrency=1 --test-name-pattern='^real core-wiki and touch-member journeys at 390px$' tests/qualification/ui-convergence/journeys.test.mjs

Fresh main uses exactly the same commands with only receipt labels changed to main-*. Fixture identities, state paths, random page IDs and OS-assigned ports are owned disposable ordinary test fixtures. The dependency tree/build/runtime state is recreated for main; no previous candidate build is reused. No selected registration is repeated.
