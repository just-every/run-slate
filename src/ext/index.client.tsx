/**
 * BUYER-OWNED CLIENT MOUNT.
 *
 * Everything exported here is loaded in the browser after hydration, never on
 * the server. Fill a slot by returning a component for one of the slot IDs in
 * `ClientSlotId`, each of which is declared in `seed.json → extensionPoints.slots`.
 *
 * Worked example:
 *
 *   export const slateClientSlots: ClientSlots = {
 *     "workspace.navigation.after.v1": () => (
 *       <a href="https://runbooks.example.internal">Runbooks</a>
 *     ),
 *   };
 */
import type { ClientSlots } from "../core/app/ext-client";

export const slateClientSlots: ClientSlots = {};
