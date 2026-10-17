import type { RuntimeConfig } from "../platform/config/runtime";

// Base's Lobby (src/base/runtime/lobby.ts, a byte-exact copy) tells a claimed
// installation's owners they can run `rer signin` from the project folder.
const RER_SIGNIN_HINT = /<p class="credit">Owners can also run <code>rer signin<\/code>[^<]*<\/p>/;

/**
 * On Managed hosting (RER's mail relay) the customer has no project folder or
 * Cloudflare account to run `rer signin` with, so the Lobby drops that line;
 * every other installation keeps Base's page unchanged.
 */
export async function managedLobby(lobby: Response, config: RuntimeConfig): Promise<Response> {
  if (config.mailProvider !== "rer" || !lobby.body || !lobby.headers.get("content-type")?.startsWith("text/html")) return lobby;
  return new Response((await lobby.text()).replace(RER_SIGNIN_HINT, ""), { status: lobby.status, headers: lobby.headers });
}
