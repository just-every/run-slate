# Slate handover

Slate is a self-hosted `core-wiki` product with public identity `just-every/slate`. Use the README journey through `rer`: install, setup with owner email, then dev. Open the printed outbox and follow the newest one-use native sign-in link; no email is sent. `describe` lists commands, flags, pins and effects.

The owner decision dated 8 October 2026 preserves native magic-link/OIDC/session/role/group/guest auth and prior data. WORK-008, WORK-009, WORK-010, WORK-015 and BASE-ACCESS-001/002 remain binding. There is no Base owner ledger. The 7 October MAIL-002 decision holds uncertain SendGrid sends for provider review; receipts establish acceptance only.

Local state is `.wrangler/state`, private settings are `.dev.vars`, installer bookkeeping is `.seed/installer` and CLI bookkeeping is `.rer/local`. Setup reruns preserve private bytes and owner/data. After native sign-in, an unfinished owner reaches `/setup`; other app routes send that owner there until the existing wizard completes. Completed setup proceeds to the app. Confirmed reset removes only the declared local inventory, retains exports and deployment receipts and refuses active operations. Local archive restore requires an empty destination before setup, followed by fresh native sign-in and renewed effect authority. Remote CLI transfer is unsupported. Product ZIP backup/restore is a distinct format.

Owner-account deployment uses Base deploy-kit and `deploy.json`, with explicitly selected Resend/SendGrid and sender. OPERATIONS.md names the actual account, token and native secret inputs. Dry run makes no provider requests. Deployment requires separate authorization.

Byte-exact Base copies and retained source proof are inventoried in `base-copies.json`. Keep shared exports unchanged; repair their maintained upstream source and repin when necessary. Applied migrations are preserved. Source checks use the existing integration-sync and edition-authoring tools.

The repository carries reproducible command-contract, native CLI journey, emitted Worker access, owner-editor, offline Base-copy and source-inventory checks. Run the README verification commands against the source you installed; these bounded checks do not establish full product acceptance. Full flagship, live mail/OIDC/provider behavior, hosted installation changes, load and production recovery require independent evidence. CONTRACT.md and ACCEPTANCE.md retain those gates.
