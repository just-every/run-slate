# Getting started

Slate runs on your own computer first. Open a terminal (on a Mac, Terminal in Applications → Utilities; on Windows, your WSL2 distribution), copy this line into it and press Enter:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-slate
```

Git is required; rer brings Node and pnpm. Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-slate` does the same.

The line installs `rer`, the Run Edit Run command, clones Slate into a `run-slate` folder, installs the pinned dependencies, sets up a local owner and starts Slate. When it is ready, open the printed `RER_OPEN` link on the same computer to sign in as the local owner, and keep that link private. On first use, name the workspace and create its first space and page at `/setup`. This free copy runs only on your computer: it sends no email, and nobody else can open it.

If the installer prints a line that puts `rer` on your PATH, run that line too. To start Slate again later, run the same line from the same folder, or `cd run-slate && rer dev`. `rer dev --stop` stops it.

[Install and deploy](INSTALL.md) covers using your own email as the owner, Run Edit Run hosting and deploying to your own Cloudflare account.
