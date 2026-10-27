import { readFile } from 'node:fs/promises';
import { watchFile, unwatchFile } from 'node:fs';
import { resolve } from 'node:path';

const carryPath = root => resolve(root, '.rer', 'local', 'business.json');

/** Presentation hints only; none of these values establishes authority. */
export async function readBusinessCarry(root, log = console.warn) {
  try {
    const value = JSON.parse(await readFile(carryPath(root), 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw new Error();
    const { version, origin, business_id, business_url, name, legal_name, accent, logo_url, refreshed_at } = value;
    const url = new URL(origin);
    if (url.origin !== origin || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error();
    if (typeof business_url !== 'string' || !business_url.startsWith(`${origin}/business/`)) throw new Error();
    if (typeof name !== 'string' || [...name].length < 1 || [...name].length > 200 || /\p{Cc}/u.test(name)) throw new Error();
    if (![legal_name, accent, logo_url].every(field => field === null || typeof field === 'string')) throw new Error();
    return JSON.stringify({ version, origin, business_id, business_url, name, legal_name, accent, logo_url, refreshed_at });
  } catch {
    log('[slate] No Business carry: the local file is missing, unreadable or invalid.');
    return null;
  }
}

/** Poll the file itself so absent parent directories and atomic replacements work. */
export function businessCarryWatch(root) {
  const file = carryPath(root);
  let stop;
  return {
    name: 'slate-business-carry',
    apply: 'serve',
    configureServer(server) {
      let timer;
      const changed = (current, previous) => {
        if (current.mtimeMs === previous.mtimeMs && current.ctimeMs === previous.ctimeMs && current.ino === previous.ino && current.size === previous.size) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            // Vite normally creates the replacement before closing the old server.
            // Cloudflare shares its runner across them; close it before changing bindings.
            await server.close();
            await server.restart();
          } catch (error) {
            server.config.logger.error(`Business carry restart failed: ${error.message}`);
          }
        }, 100);
      };
      watchFile(file, { interval: 500, persistent: false }, changed);
      stop = () => { clearTimeout(timer); unwatchFile(file, changed); };
    },
    closeBundle() { stop?.(); },
  };
}
