import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createIsomorphicFn } from "@tanstack/react-start";
import { ownerIdentity } from "../../ext/config";

/**
 * UI seams a buyer's client bundle may fill. Every ID here is declared in
 * `seed.json → extensionPoints.slots`, and `scripts/verify.mjs` fails if this
 * union and that list disagree. The rendering foundation renders one seam; the
 * feature lanes add the rest of the declared slots as their panels land.
 */
export type ClientSlotId = "workspace.navigation.after.v1";
export type ClientSlots = Partial<Record<ClientSlotId, () => ReactNode>>;

const emptySlots: ClientSlots = {};
const ClientSlotContext = createContext<ClientSlots>(emptySlots);

/**
 * One of the two modules where core may import ext. The buyer's client mount is
 * loaded only in the browser, after hydration, so the server graph never sees
 * it and the first client render still matches the server HTML.
 */
const loadClientSlots = createIsomorphicFn().client(
  async () => (await import("../../ext/index.client")).slateClientSlots,
);

export function ExtensionSlotProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<ClientSlots>(emptySlots);

  useEffect(() => {
    const pending = loadClientSlots();
    if (!pending) return;
    let active = true;
    pending.then(
      (loaded) => {
        if (active) setSlots(loaded);
      },
      (cause: unknown) => {
        throw new Error(`The buyer client mount src/ext/index.client failed to load: ${String(cause)}`);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return <ClientSlotContext.Provider value={slots}>{children}</ClientSlotContext.Provider>;
}

export function ExtensionSlot({ id }: { id: ClientSlotId }) {
  const render = useContext(ClientSlotContext)[id];
  return render ? <>{render()}</> : null;
}

export { ownerIdentity };
