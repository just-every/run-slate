import type { RunData } from "../base/runtime/run-site";
import { runPricing } from "../base/runtime/run-pricing";

/** Every Run page string and command for Slate (run-slate.com/run). */
export const run: RunData = {
  name: "Slate",
  repository: "https://github.com/just-every/run-slate",
  clone: "npx -y @runeditrun/rer dev just-every/run-slate",
  licence: "MIT",
  docs: true,
  paths: { product: null },
  pricing: runPricing,
};
