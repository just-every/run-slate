import type { ReactNode } from "react";
import { ownerIdentity } from "../../../app/ext-client";
import { SlateMark } from "../../../ui/brand/SlateMark";
import { Mug } from "../../landing/drawings/hero/Mug";
import { Plant } from "../../landing/drawings/hero/Plant";
import { HydrationUnit } from "../../../../base/runtime/hydration/unit";
import "./paper.css";

/**
 * The frame of the sign-in and first-run pages: the landing's lockup (Slate's mark and the owner's name, linking home) over the
 * cream page, with the signed-in owner's own address in the corner when there is one. Fixed light, like the landing.
 */
export function PaperPage({ owner, className = "", children }: { owner?: string; className?: string; children: ReactNode }) {
  // Home is the Lobby, a full document the Worker answers, so the lockup is a plain link.
  const lockup = <><SlateMark />{ownerIdentity.name}</>;
  return (
    <div className={`paper-page ${className}`.trim()} data-theme="light">
      <HydrationUnit>
        <header className="paper-header">
          <a className="paper-brand" href="/">{lockup}</a>
          {owner ? (
            <span className="paper-owner" title={owner}>
              <span className="paper-owner-initial" aria-hidden="true">{owner.charAt(0)}</span>
              <span className="paper-owner-email" data-testid="member-email">{owner}</span>
            </span>
          ) : null}
        </header>
      </HydrationUnit>
      <main className="paper-main"><HydrationUnit>{children}</HydrationUnit></main>
    </div>
  );
}

const wash = "M6 38C9 18 26 5 48 4 70 3 90 9 96 28 101 44 99 64 94 80 89 95 70 99 48 98 28 97 8 92 3 74 0 62 3 50 6 38Z";

/** The landing's plant and mug on a green wash. Decoration only. */
export function PaperScene() {
  return (
    <div className="paper-scene" aria-hidden="true">
      <svg className="paper-scene-wash" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false"><path d={wash} /></svg>
      <svg className="paper-scene-ground" viewBox="0 0 520 426" preserveAspectRatio="none" focusable="false"><path d="M30 336H58M92 345H150M400 342H436M452 334H500" /></svg>
      <Plant />
      <Mug />
    </div>
  );
}
