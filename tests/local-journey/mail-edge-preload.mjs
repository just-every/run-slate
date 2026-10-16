import { registerHooks } from 'node:module';

// CLI and Vite run normally. Only Vite's Miniflare conversion receives the test
// transport; app modules, sessions, challenges and confirmation are untouched.
const edge = new URL('./mail-edge.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (specifier !== 'miniflare' || !context.parentURL?.includes('/@cloudflare/vite-plugin/')) return resolved;
    const source = `
      export * from ${JSON.stringify(resolved.url)};
      import { convertV4MiniflareOptions as convert, Response } from ${JSON.stringify(resolved.url)};
      import { withMailEdge } from ${JSON.stringify(edge)};
      export const convertV4MiniflareOptions = options => convert(withMailEdge(options, Response));
    `;
    return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
  },
});
