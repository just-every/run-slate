import type { RunData } from "../base/runtime/run-site";

/** Every Run page string and command for Slate (run-slate.com/run). */
export const run: RunData = {
  name: "Slate",
  repository: "https://github.com/just-every/run-slate",
  clone: "npx -y @runeditrun/rer dev just-every/run-slate",
  folder: "run-slate",
  requirements: "Needs Git and Node 22 or later, on macOS, Linux or Windows with WSL2. rer installs the pnpm and Node versions Slate pins by itself.",
  licence: "MIT",
  docs: true,
  hosted: [],
};
