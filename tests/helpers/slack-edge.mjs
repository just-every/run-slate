import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const control = directory => path.join(directory, 'slack-edge.json');
const messages = directory => path.join(directory, 'slack-messages.jsonl');
export async function setSlackFailure(directory, failure = 'ok') {
  if (!['ok', 'rate_limited', 'channel_not_found', 'token_revoked', 'public_channel'].includes(failure)) throw new Error('Unknown Slack edge failure');
  await writeFile(control(directory) + '.new', JSON.stringify({ failure }));
  await rename(control(directory) + '.new', control(directory));
}
export async function initializeSlackEdge(directory) {
  await writeFile(messages(directory), '');
  await setSlackFailure(directory);
}
export async function readSlackMessages(directory) {
  return (await readFile(messages(directory), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
}

/** Fake only Slack's HTTP boundary; the emitted application's routes and delivery run unchanged. */
export async function slackEdge(request, directory, ResponseClass) {
  if (new URL(request.url).origin !== 'https://slack.com') return null;
  let failure;
  try { ({ failure } = JSON.parse(await readFile(control(directory), 'utf8'))); }
  catch (cause) { if (cause.code === 'ENOENT') return null; throw cause; }
  const method = new URL(request.url).pathname.split('/').at(-1);
  const reply = (body, status = 200) => new ResponseClass(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  switch (method) {
    case 'auth.test': return reply({ ok: true, team_id: 'TTEST', user_id: 'BTEST', bot_id: 'BTEST' });
    case 'conversations.info': return reply({ ok: true, channel: { id: 'GTEST', is_private: failure !== 'public_channel', is_ext_shared: false, is_org_shared: false } });
    case 'conversations.members': return reply({ ok: true, members: ['BTEST', 'UREADER'] });
    case 'users.info': return reply({ ok: true, user: { id: 'UREADER', is_bot: false, profile: { email: 'reader@test.invalid' } } });
    case 'chat.postMessage': {
      const message = await request.json();
      await appendFile(messages(directory), JSON.stringify({ ...message, accepted: failure === 'ok', failure }) + '\n');
      if (failure === 'rate_limited') return reply({ ok: false, error: failure }, 429);
      return reply(failure === 'ok' ? { ok: true, ts: String(Date.now() / 1000) } : { ok: false, error: failure });
    }
    case 'conversations.history': return reply({ ok: true, messages: [] });
    default: throw new Error(`Unexpected Slack edge method: ${method}`);
  }
}
