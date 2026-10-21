import { expect } from 'vitest';

export interface SlackAudienceFixture {
  channel?: { is_private?: boolean; is_ext_shared?: boolean; is_org_shared?: boolean };
  users?: Record<string, { deleted?: boolean; is_bot?: boolean; profile?: { email?: string } }>;
}

/** Only Slack's HTTP boundary is replaced; configuration, storage, queues and access checks stay real. */
export function slackNetwork(email: string, token: string) {
  const messages: { text: string; client_msg_id: string; channel: string }[] = [];
  const attempts: string[] = [];
  let failure: 'transient' | 'permanent' | 'revoked' | 'expired' | undefined;
  let beforeAudience: (() => Promise<void>) | undefined;
  let audience: SlackAudienceFixture = {};
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin !== 'https://slack.com') return original(input, init);
    expect(request.headers.get('authorization')).toBe(`Bearer ${token}`);
    const method = url.pathname.replace('/api/', '');
    attempts.push(method);
    const writing = method === 'chat.postMessage' || method === 'chat.update';
    expect(request.method).toBe(writing ? 'POST' : 'GET');
    if (writing) expect(request.headers.get('content-type')).toBe('application/json');
    const body = writing ? await request.json<any>() : Object.fromEntries(url.searchParams);
    if (failure === 'revoked' || failure === 'expired') return Response.json({ ok: false, error: failure === 'revoked' ? 'token_revoked' : 'token_expired' });
    if (method === 'auth.test') return Response.json({ ok: true, user_id: 'BOT', team_id: 'TEAM' });
    if (method === 'conversations.info') return Response.json({ ok: true, channel: { is_private: true, is_ext_shared: false, is_org_shared: false, ...audience.channel } });
    if (method === 'conversations.members') {
      await beforeAudience?.(); beforeAudience = undefined;
      return Response.json({ ok: true, members: ['BOT', ...Object.keys(audience.users ?? { READER: {} })] });
    }
    if (method === 'users.info') return Response.json({ ok: true, user: audience.users ? audience.users[String(body.user)] : { profile: { email } } });
    if(method==='chat.update'){const sent=messages[Number(body.ts)-1];expect(sent).toBeTruthy();sent!.text=body.text;return Response.json({ok:true});}
    if (writing) {
      if (failure === 'transient') { failure = undefined; return new Response('', { status: 429 }); }
      if (failure === 'permanent') return Response.json({ ok: false, error: 'channel_not_found' });
      expect(body.unfurl_links).toBe(false); expect(body.unfurl_media).toBe(false); expect(body.mrkdwn).toBe(false);
      messages.push(body);
      return Response.json({ ok: true, ts: String(messages.length) });
    }
    if (method === 'conversations.history') return Response.json({ ok: true, messages: messages.map((m, i) => ({ ...m, ts: String(i + 1) })) });
    throw new Error(`Unexpected Slack method ${method}`);
  };
  return { messages, attempts, setAudience: (value: SlackAudienceFixture = {}) => { audience = value; }, fail: (value: typeof failure) => { failure = value; }, duringAudience: (callback: () => Promise<void>) => { beforeAudience = callback; }, restore: () => { globalThis.fetch = original; } };
}
