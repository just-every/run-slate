import { checkIdentity, type EditionIdentity } from "./base/runtime/identity";
import { claimedWhen } from "./base/runtime/setup-state";
import { copy } from "./core/features/landing/copy";
import { ownerIdentity } from "./ext/config";

/**
 * Slate's edition identity: what the installed Lobby at `/` and the run site (run-slate.com) say about it. The deployment
 * name is the owner's own (`src/ext/config.ts`); the tagline is the approved landing's hero line.
 */
export const identity: EditionIdentity = checkIdentity({
  product: "Slate",
  deployment: ownerIdentity.name,
  purpose: "{deployment}’s pages, databases and search, in one private wiki.",
  tagline: copy.hero.sub,
  signInPath: "/signin",
  runSite: "https://run-slate.com",
  installedHome: "lobby",
  theme: "/rer-theme.css",
  mark: "/slate-mark.svg",
  band: "/brand/band.svg",
});

/** The installation is claimed once its owner has finished first-run setup at `/setup` (WORK-013). */
export const claimed = claimedWhen("SELECT 1 FROM workspaces WHERE first_run_completed_at IS NOT NULL LIMIT 1");
