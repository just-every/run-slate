import type { RunData } from "../base/runtime/run-site";

/** Every Run page string and command for Slate (run-slate.com/run). */
export const run: RunData = {
  name: "Slate",
  repository: "https://github.com/just-every/run-slate",
  clone: "git clone https://github.com/just-every/run-slate.git slate",
  folder: "slate",
  requirements: "Needs Node 22 or later and pnpm 10.12.4, on macOS, Linux or Windows with WSL2.",
  licence: "MIT",
  docs: true,
  hosted: [],
};
