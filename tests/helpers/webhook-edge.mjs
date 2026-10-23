import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
const control = directory => path.join(directory, 'webhook-edge.json');
export async function initializeWebhookEdge(directory) { await writeFile(control(directory), JSON.stringify({ failure: false })); }
export async function setWebhookFailure(directory, failure) { await writeFile(control(directory), JSON.stringify({ failure })); }
/** Only the destination and its DNS answers are faked. Slate's routes and queue run unchanged. */
export async function webhookEdge(request, directory, ResponseClass) {
  const url = new URL(request.url), dns = url.hostname === 'cloudflare-dns.com' && url.searchParams.get('name') === 'synthetic-slate-1.example.com';
  if (!dns && url.hostname !== 'synthetic-slate-1.example.com') return null;
  let fixture; try { fixture = JSON.parse(await readFile(control(directory), 'utf8')); } catch (cause) { if (cause.code === 'ENOENT') return null; throw cause; }
  if (dns) return new ResponseClass(JSON.stringify({ Answer: url.searchParams.get('type') === 'A' ? [{ type: 1, data: '8.8.8.8' }] : [] }), { headers: { 'content-type': 'application/json' } });
  await appendFile(path.join(directory, 'webhook-receiver.jsonl'), JSON.stringify({ body: await request.text(), signature: request.headers.get('Slate-Signature'), eventId: request.headers.get('Slate-Event-Id') }) + '\n');
  return new ResponseClass(fixture.failure ? '<script>synthetic-slate-response</script>' : 'synthetic-slate-received', { status: fixture.failure ? 503 : 200 });
}
