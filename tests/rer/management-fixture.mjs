// The native owner-editor test's management service boundary.
import {createServer} from 'node:http';
export async function fixtureProvider() {
  const state = {allowed: '', requests: 0};
  const server = createServer((request, response) => {
    state.requests++;
    response.writeHead(200, {'Content-Type': 'text/html', 'Content-Security-Policy': `frame-ancestors ${state.allowed}`});
    response.end(`<!doctype html><html><body><div id="panel" style="position:fixed;right:8px;bottom:80px;width:min(350px,calc(100vw - 16px));padding:20px;box-sizing:border-box;background:white;border:1px solid #bbc;border-radius:12px;font:16px system-ui">Slate management service fixture</div><script>
      const params = new URL(location.href).searchParams;
      const parentOrigin = params.get('parentOrigin'), installationId = params.get('installation');
      let sessionId;
      window.received = [];
      window.send = (type, payload = {}) => parent.postMessage({protocol: 'rer-editor', version: 1, installationId, ...(type === 'ready' ? {} : {sessionId}), type, ...payload}, parentOrigin);
      const regions = () => { if (sessionId) { const {x, y, width, height} = document.querySelector('#panel').getBoundingClientRect(); window.send('interactive-regions', {viewport: {width: innerWidth, height: innerHeight}, regions: [{x, y, width, height}]}); } };
      addEventListener('resize', regions);
      addEventListener('message', event => {
        if (event.origin !== parentOrigin || event.source !== parent) return;
        const message = event.data;
        window.received.push(message);
        if (message.type === 'protocol-offer') { sessionId = message.sessionId; window.send('protocol-accept'); }
        if (['protocol-connected', 'editor-visibility'].includes(message.type)) regions();
      });
      window.send('ready');
    </script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {state, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve))};
}
