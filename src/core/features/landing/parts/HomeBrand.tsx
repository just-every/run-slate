import { ownerIdentity } from "../../../app/ext-client";
import { SlateMark } from "../../../ui/brand/SlateMark";

/**
 * The header lockup on pages other than the landing: the same mark and owner name as `Brand`, but a link home and bare
 * text, because on those pages the page's own title is the one h1. Home is a full document: the Lobby on an installed
 * Slate, the landing on the run site.
 */
export function HomeBrand() {
  return (
    <a className="brand" href="/">
      <span className="brand-mark" aria-hidden="true"><SlateMark /></span>
      <span className="brand-name">{ownerIdentity.name}</span>
    </a>
  );
}
