import { ownerIdentity } from "../../../app/ext-client";
import { SlateMark } from "../../../ui/brand/SlateMark";

/**
 * The owner's lockup: Slate's stacked-cards logo, then the owner's name. The header's lockup holds
 * the page's one h1, bare text so the server emits `<h1 ...>Name</h1>`; the footer's is only a link back to the top.
 */
export function Brand({ heading = false }: { heading?: boolean }) {
  return (
    <a className="brand" href="#top">
      <span className="brand-mark" aria-hidden="true"><SlateMark /></span>
      {heading ? <h1 className="brand-name">{ownerIdentity.name}</h1> : <span className="brand-name">{ownerIdentity.name}</span>}
    </a>
  );
}
