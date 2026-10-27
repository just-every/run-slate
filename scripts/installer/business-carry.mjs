import { readFile, stat } from 'node:fs/promises';
import { watchFile, unwatchFile } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';

const carryPath = root => resolve(root, '.rer', 'local', 'business.json');
const listeners = new Map();
const graphMaps = ['urlToModuleMap', 'idToModuleMap', 'etagToModuleMap', 'fileToModulesMap'];

async function stamp(file) {
  try { const value = await stat(file); return [value.mtimeMs, value.size]; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function clientCache(server) {
  const graph = server.environments.client.moduleGraph;
  const files = new Set([...graph.fileToModulesMap.keys(), server.config.configFile].filter(Boolean));
  return {
    maps: graphMaps.map(name => [name, [...graph[name]]]),
    stamps: await Promise.all([...files].map(async file => [file, await stamp(file)])),
  };
}

async function restoreClient(server, cache) {
  if (!cache) return;
  const current = await Promise.all(cache.stamps.map(([file]) => stamp(file)));
  if (cache.stamps.some(([, before], index) => JSON.stringify(before) !== JSON.stringify(current[index]))) return;
  const graph = server.environments.client.moduleGraph;
  for (const [name, entries] of cache.maps) {
    graph[name].clear();
    for (const [key, value] of entries) graph[name].set(key, value);
  }
  // Vite's bootstrap contains the new socket token; ordinary client modules
  // contain no Worker bindings and remain valid for a carry-only restart.
  const bootstrap = graph.urlToModuleMap.get('/@vite/client');
  if (bootstrap) {
    bootstrap.transformResult = null;
    for (const [etag, module] of graph.etagToModuleMap) if (module === bootstrap) graph.etagToModuleMap.delete(etag);
  }
}

function servingState() {
  const state = { active: 0, idle: [], sockets: new Set() };
  state.pause = () => {
    state.paused = true;
    state.ready = new Promise(resolve => { state.release = () => { state.paused = false; resolve(); }; });
  };
  state.pause();
  state.http = createServer(async (request, response) => {
    await state.ready;
    if (response.destroyed) return;
    state.active++;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (--state.active === 0) state.idle.splice(0).forEach(resolve => resolve());
    };
    response.once('finish', finish);
    response.once('close', finish);
    state.server.middlewares(request, response);
  });
  state.http.on('connection', socket => {
    state.sockets.add(socket);
    socket.once('close', () => state.sockets.delete(socket));
  });
  const emit = state.http.emit.bind(state.http);
  state.http.emit = (event, ...args) => {
    if (event === 'upgrade' && state.paused) {
      void state.ready.then(() => { if (!args[1].destroyed) emit(event, ...args); });
      return true;
    }
    return emit(event, ...args);
  };
  return state;
}

/** Keep rer's upstream listener open while Vite replaces its middleware and Worker. */
function keepServing(server, state, root, warmup) {
  const close = server.close.bind(server), restart = server.restart.bind(server);
  const urls = () => {
    const address = state.http.address();
    if (address) server.resolvedUrls = { local: [`http://127.0.0.1:${address.port}${server.config.base}`], network: [] };
  };
  urls();
  server.listen = async (port = server.config.server.port ?? 5173) => {
    await Promise.all(Object.values(server.environments).map(environment => environment.listen(server)));
    if (!state.http.listening) await new Promise((resolve, reject) => {
      state.http.once('error', reject);
      state.http.listen(port, typeof server.config.server.host === 'string' ? server.config.server.host : '127.0.0.1', () => {
        state.http.off('error', reject);
        resolve();
      });
    });
    urls();
    state.release();
    return server;
  };
  server.close = async () => {
    await close();
    if (state.restarting) return;
    listeners.delete(root);
    process.off('SIGTERM', state.shutdown);
    process.off('SIGINT', state.shutdown);
    for (const socket of state.sockets) socket.destroy();
    if (state.http.listening) await new Promise(resolve => state.http.close(resolve));
  };
  server.restart = (force) => {
    if (state.restart) return state.restart;
    state.restart = (async () => {
      state.restarting = true;
      state.pause();
      if (state.active) await new Promise(resolve => state.idle.push(resolve));
      // Existing HMR sockets stay alive until the replacement is warm. New
      // upgrades and HTTP requests wait for its fully configured middleware.
      for (const handler of state.http.listeners('upgrade')) state.http.off('upgrade', handler);
      const closeHot = server.ws.close.bind(server.ws);
      server.ws.close = async () => {};
      try {
        await close();
        state.clientCache = state.carry ? await clientCache(server) : null;
        await restart(force);
        state.release();
        await warmup?.(server);
      } finally {
        await closeHot();
        state.restarting = false;
        state.release();
      }
    })().finally(() => { state.restart = null; });
    return state.restart;
  };
}

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
export function businessCarryWatch(root, warmup) {
  const file = carryPath(root);
  let stop;
  return {
    name: 'slate-business-carry',
    apply: 'serve',
    configResolved(config) {
      let state = listeners.get(root);
      if (!state) {
        state = servingState();
        listeners.set(root, state);
        state.shutdown = () => { void state.server.close().catch(error => config.logger.error(error.message)); };
        process.once('SIGTERM', state.shutdown);
        process.once('SIGINT', state.shutdown);
      }
      config.server.middlewareMode = true;
      config.server.ws = { ...config.server.ws, server: state.http };
    },
    async configureServer(server) {
      const state = listeners.get(root);
      await restoreClient(server, state.clientCache);
      state.clientCache = null;
      state.server = server;
      server.httpServer = state.http;
      let timer;
      const changed = (current, previous) => {
        if (current.mtimeMs === previous.mtimeMs && current.ctimeMs === previous.ctimeMs && current.ino === previous.ino && current.size === previous.size) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          state.carry = true;
          try {
            await server.restart();
          } catch (error) {
            server.config.logger.error(`Business carry restart failed: ${error.message}`);
          } finally {
            state.carry = false;
          }
        }, 100);
      };
      watchFile(file, { interval: 500, persistent: false }, changed);
      stop = () => { clearTimeout(timer); unwatchFile(file, changed); };
      return () => keepServing(server, state, root, warmup);
    },
    closeBundle() { stop?.(); },
  };
}
