import { request } from 'node:http';

/** Own and drain each readiness exchange; never inherit an idle pooled socket. */
export function runtimeHealth(baseUrl, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sent = new Headers(headers);
    sent.set('connection', 'close');
    const probe = request(new URL('/health', baseUrl), {
      agent: false,
      headers: Object.fromEntries(sent),
      signal: AbortSignal.timeout(timeoutMs),
    }, response => {
      response.on('error', reject);
      response.on('end', () => resolve(response.statusCode));
      response.resume();
    });
    probe.on('error', reject);
    probe.end();
  });
}
