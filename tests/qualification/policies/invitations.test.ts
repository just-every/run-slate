import { env } from 'cloudflare:test';
import { test, expect, vi } from 'vitest';
import { scenario, key, rows } from './helpers';
import { createPage, readPage } from '../../../src/core/features/pages/service';
import { invite, acceptInvitation } from '../../../src/core/features/workspace/invitations';
import { saveGrant, listGrants } from '../../../src/core/features/sharing/grants';
import { readRuntimeConfig } from '../../../src/core/platform/config/runtime';
import { createSessionRepository } from '../../../src/core/features/session/repository';
test('SHARE-006 SHARE-001 SHARE-007: pending guest invitation grants no access, local provider double captures exact acceptance token, revoke invalidates pending grant', async () => {
    const { owner, containerId } = await scenario();
    const page = await createPage(owner, { operationKey: key('page'), containerId, title: 'Guest invitation' });
    const config = { ...readRuntimeConfig(env, false), appUrl: 'https://qualification.invalid', mailFrom: 'test@qualification.invalid', mailApiKey: 'TEST-ONLY-PROVIDER-DOUBLE' };
    const requests: string[] = [];
    const provider = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { requests.push(String(init?.body)); return Response.json({ id: 'LOCAL-SEMANTIC-MAIL-RECEIPT' }); });
    try {
        await invite(owner, config, { operationKey: key('invite'), email: 'pending@qualification.invalid', kind: 'guest', pageId: page.value.pageId });
        const [pending] = await rows('SELECT * FROM invitations WHERE page_id=?', page.value.pageId);
        expect(pending.accepted_by_member_id).toBeNull();
        expect((await listGrants(owner, 'page', page.value.pageId)).items.some(g => g.invitationEmail === 'pending@qualification.invalid')).toBe(true);
        expect(requests).toHaveLength(1);
        const match = requests[0].match(/https:\/\/qualification\.invalid\/api\/auth\/invitation\/accept\?token=([A-Za-z0-9_-]+)/);
        expect(match).not.toBeNull();
        await saveGrant(owner, { operationKey: key('revoke'), targetKind: 'page', targetId: page.value.pageId, id: pending.page_grant_id as string, principalKind: 'member', principalId: `invitation:${pending.id}`, level: 'view', revoke: true });
        await expect(acceptInvitation(env.DB, config, match![1], { files: env.FILES, jobs: env.JOBS })).rejects.toMatchObject({ code: 'LINK_INVALID' });
        expect(await rows("SELECT id FROM members WHERE email='pending@qualification.invalid'")).toEqual([]);
        expect((await rows('SELECT revoked_at FROM invitations WHERE id=?', pending.id))[0].revoked_at).toBe(owner.now);
        await invite(owner, config, { operationKey: key('invite-live'), email: 'accepted@qualification.invalid', kind: 'guest', pageId: page.value.pageId });
        const token = requests[1].match(/https:\/\/qualification\.invalid\/api\/auth\/invitation\/accept\?token=([A-Za-z0-9_-]+)/)![1];
        await acceptInvitation(env.DB, config, token, { files: env.FILES, jobs: env.JOBS });
        const [accepted] = await rows("SELECT id FROM members WHERE email='accepted@qualification.invalid'");
        const actor = await createSessionRepository(env.DB).getMember(accepted.id as string);
        expect((await readPage({ ...owner, actor: actor! }, page.value.pageId)).page.title).toBe('Guest invitation');
        await expect(acceptInvitation(env.DB, config, token, { files: env.FILES, jobs: env.JOBS })).rejects.toMatchObject({ code: 'LINK_INVALID' });
    }
    finally {
        provider.mockRestore();
    }
});
