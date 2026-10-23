import { decryptSecret } from '../../platform/secrets/custody';
import { validateDestination } from './destination';
import { secretScope, type Subscription, type Delivery } from './store';
export async function signedExchange(subscription: Subscription, delivery: Delivery, key: string, authorize: () => Promise<unknown | null>) {
  const started = Date.now(), signal = AbortSignal.timeout(10000);
  const destination = await validateDestination(subscription.destination);
  const payload = await authorize();
  if(!payload)return {status:null as number|null,durationMs:Date.now()-started,response:'',outcome:'withheld'};
  const body = JSON.stringify({ ...payload as object, replay: delivery.replay_count > 0 });
  const timestamp = delivery.last_timestamp!, secret = await decryptSecret(key, subscription.credential_ciphertext!, secretScope(subscription));
  const signingKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(`${timestamp}.${body}`)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const response = await fetch(destination, { method: 'POST', redirect: 'manual', signal, headers: { 'Content-Type': 'application/json', 'Slate-Signature': `t=${timestamp},v1=${signature}`, 'Slate-Event-Id': delivery.event_id, 'Slate-Delivery-Id': delivery.id, 'Slate-Attempt': String(delivery.attempt_count) }, body });
  const reader = response.body?.getReader(), bytes = new Uint8Array(512); let size = 0;
  try {
    while (reader && size < bytes.length) { const part = await reader.read(); if (part.done) break; const count = Math.min(part.value.length, bytes.length - size); bytes.set(part.value.subarray(0, count), size); size += count; }
  } finally { await reader?.cancel(); }
  return { status: response.status, durationMs: Date.now() - started, response: new TextDecoder().decode(bytes.subarray(0, size)), outcome: response.status >= 300 && response.status < 400 ? 'redirect-refused' : response.ok ? 'sent' : 'receiver-failed' };
}
