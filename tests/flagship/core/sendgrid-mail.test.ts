import {env} from 'cloudflare:test';
import {test, expect, vi} from 'vitest';
import {seedWorkspace, seedMember} from '../../e2e/setup/fixtures';
import type {FeatureContext} from '../../../src/core/app/feature-context';
import {readRuntimeConfig} from '../../../src/core/platform/config/runtime';
import {invite} from '../../../src/core/features/workspace/invitations';
import {scheduleIdentityMail} from '../../../src/core/features/session/mail';
import {retryIdentityMail, listIdentityMail} from '../../../src/core/features/session/mail-status';
const config = {...readRuntimeConfig(env, false), mailProvider: 'sendgrid' as const, appUrl: 'https://slate.test.invalid', mailFrom: 'Slate <mail@test.invalid>', mailApiKey: 'test-only-key'};
async function fixture() {
  const {workspaceId} = await seedWorkspace();
  const {memberId} = await seedMember(workspaceId, {email: `${workspaceId}@test.invalid`, role: 'owner', displayName: 'Owner', isSetupOwner: true});
  return {db: env.DB, files: env.FILES, jobs: env.JOBS, actor: {id: memberId, workspaceId, workspaceName: 'Workspace', email: `${workspaceId}@test.invalid`, displayName: 'Owner', initials: 'O', role: 'owner'}, now: new Date().toISOString()} as FeatureContext;
}
for (const outcome of ['receipt', 'no-receipt', 'transport', 'server-error'] as const) {
  test(`MAIL-002 BASE-ACCESS-001 Base Mail SendGrid ${outcome} retains durable attempt without blind resend`, async () => {
    const ctx = await fixture();
    const provider = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (outcome === 'transport') throw Error('private provider detail');
      return new Response(null, {status: outcome === 'server-error' ? 503 : 202, headers: outcome === 'receipt' ? {'x-message-id': 'confirmed-provider-receipt'} : {}});
    });
    try {
      const input = {operationKey: crypto.randomUUID(), email: 'recipient@test.invalid', kind: 'member' as const};
      await invite(ctx, config, input);
      const row = await env.DB.prepare('SELECT * FROM mail_deliveries WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<any>();
      expect(row.provider).toBe('sendgrid');
      expect(row.attempt_count).toBe(1);
      expect(row.delivery_phase).toBe(outcome === 'receipt' ? 'sent' : 'uncertain');
      expect(row.provider_message_id).toBe(outcome === 'receipt' ? 'confirmed-provider-receipt' : null);
      const [url, init] = provider.mock.calls[0]!;
      expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
      expect(new Headers(init!.headers).has('Idempotency-Key')).toBe(false);
      const body = JSON.parse(String(init!.body));
      expect(body.custom_args.rer_delivery_id).toBe(row.id);
      expect(body.tracking_settings.open_tracking.enable).toBe(false);
      expect(body.personalizations[0].to).toEqual([{email: input.email}]);
      await invite(ctx, config, input);
      const later = {...ctx, now: new Date(Date.parse(ctx.now) + 180000).toISOString()};
      await scheduleIdentityMail(env.DB, config, ctx, later.now);
      if (outcome !== 'receipt') {
        expect((await listIdentityMail(later)).items[0]).toMatchObject({state: 'uncertain', canRetry: false});
        await expect(retryIdentityMail(later, config, row.id)).rejects.toMatchObject({code: 'MAIL_UNCERTAIN'});
        expect(row.error_detail).not.toContain('private provider detail');
      }
      expect(provider).toHaveBeenCalledTimes(1);
    } finally {provider.mockRestore();}
  });
}
test('MAIL-002 SendGrid expired dispatch lease holds uncertain even without a persisted provider response', async () => {
  const ctx = await fixture();
  const provider = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {status: 202}));
  try {
    await invite(ctx, config, {operationKey: crypto.randomUUID(), email: 'crash@test.invalid', kind: 'member'});
    const row = await env.DB.prepare('SELECT id FROM mail_deliveries WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{id: string}>();
    await env.DB.prepare("UPDATE mail_deliveries SET delivery_phase='sending',lease_until=?,next_attempt_at=? WHERE id=?").bind(ctx.now, ctx.now, row!.id).run();
    await scheduleIdentityMail(env.DB, config, ctx, ctx.now);
    expect(provider).toHaveBeenCalledTimes(1);
    expect((await listIdentityMail(ctx)).items[0]).toMatchObject({state: 'uncertain', canRetry: false});
  } finally {provider.mockRestore();}
});
