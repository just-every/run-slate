import { request as httpRequest } from 'node:http';

type RequestOptions = Omit<RequestInit,'body'> & {body?: string};

/** Every fixture request owns its connection, response body and total deadline. */
export function doorTransport(origin: () => string) {
  const pending = new Map<AbortController, Promise<Response>>();
  let closed = false;
  async function request(path: string, init: RequestOptions = {}) {
    if (closed) throw new Error('door_transport_closed');
    const controller = new AbortController();
    const signal = init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
    signal.throwIfAborted();
    const connectionClosed = Promise.withResolvers<void>();
    const response = new Promise<Response>((resolve, reject) => {
      const client = httpRequest(new URL(path, origin()), {
        method: init.method, headers: Object.fromEntries(new Headers(init.headers)), agent: false, signal,
      }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.once('error', reject);
        response.once('end', () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) for (const part of value) headers.append(key, part);
            else if (value !== undefined) headers.set(key, value);
          }
          const status = response.statusCode!;
          resolve(new Response([204, 205, 304].includes(status) || init.method === 'HEAD' ? null : Buffer.concat(chunks), {status, headers}));
        });
      });
      client.once('error', reject);
      // Real fixture SQL can run for minutes. This is a hang guard, not a speed assertion.
      const deadline = setTimeout(() => controller.abort(new Error('door_request_deadline')), 10 * 60_000);
      deadline.unref();
      client.once('close', () => { clearTimeout(deadline); connectionClosed.resolve(); });
      client.end(init.body);
    });
    const operation = (async () => { try { return await response; } finally { await connectionClosed.promise; } })();
    pending.set(controller, operation);
    try { return await operation; }
    finally { pending.delete(controller); }
  }
  async function close() {
    closed = true;
    const operations = [...pending.values()];
    for (const controller of pending.keys()) controller.abort(new Error('door_transport_closed'));
    await Promise.allSettled(operations);
  }
  return {request, close};
}
