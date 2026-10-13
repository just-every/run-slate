import type { AppBindings, AuthenticatedMember } from '../../app/types';
import type { FeatureContext } from '../../app/feature-context';
import { publishScheduledPage } from './publication';
import type { PublicationSchedule } from './publication-input';
import { notificationStatements } from '../notifications/events';
import { ApiProblem } from '../../app/problems';
import { latestVerificationSql } from '../page-status/state';
export async function runContentJobs(env: AppBindings, now = new Date().toISOString()) {
    const schedules = (await env.DB.prepare("SELECT * FROM content_schedules WHERE state='scheduled' AND publish_at<=? ORDER BY publish_at LIMIT 100").bind(now).all<PublicationSchedule>()).results;
    for (const s of schedules) {
        const actor = await env.DB.prepare("SELECT m.id,m.workspace_id AS workspaceId,m.email,m.display_name AS displayName,m.initials,m.role,w.name AS workspaceName FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=? AND m.status='active'").bind(s.actor_member_id).first<AuthenticatedMember>();
        try {
            if (!actor)
                throw new Error('The scheduling member is no longer active.');
            await publishScheduledPage({ db: env.DB, files: env.FILES, jobs: env.JOBS, actor, now }, s);
        }
        catch (e) {
            await env.DB.prepare("UPDATE content_schedules SET state='failed',failure=?,updated_at=? WHERE page_id=? AND operation_key=? AND state='scheduled'").bind(e instanceof ApiProblem && e.status === 404 ? 'Scheduled publication cannot access the page or destination. Restore access and reschedule.' : e instanceof Error ? e.message : 'Scheduled publication failed; review the saved choices and reschedule.', now, s.page_id, s.operation_key).run();
        }
    }
    // STAT-004: a lapse notifies once, only for the attestation the page still carries.
    // Superseded rows, cleared statuses, trashed or archived pages and verifiers who are
    // no longer active members never match, so they cannot hold back the rows that do;
    // the review list shows a page whose verifier left to workspace owners instead.
    const expired = (await env.DB.prepare(`SELECT v.*,p.workspace_id FROM page_verifications v JOIN pages p ON p.id=v.page_id JOIN members m ON m.id=v.owner_member_id AND m.workspace_id=p.workspace_id AND m.status='active' WHERE v.expires_at<=? AND v.lapsed_notified_at IS NULL AND v.id=${latestVerificationSql('p')} AND p.status_key IS v.status_key AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL ORDER BY v.expires_at,v.id LIMIT 100`).bind(now).all<Record<string, any>>()).results;
    for (const v of expired) {
        const actor = await env.DB.prepare("SELECT m.id,m.workspace_id AS workspaceId,m.email,m.display_name AS displayName,m.initials,m.role,w.name AS workspaceName FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=? AND m.status='active'").bind(v.owner_member_id).first<AuthenticatedMember>();
        if (!actor)
            continue;
        const ctx: FeatureContext = { db: env.DB, files: env.FILES, jobs: env.JOBS, actor, now };
        await env.DB.batch([env.DB.prepare('UPDATE page_verifications SET lapsed_notified_at=? WHERE id=? AND lapsed_notified_at IS NULL').bind(now, v.id), ...notificationStatements(ctx, { id: `verification:${v.id}:lapsed`, event: 'verification-lapsed', pageId: v.page_id, actorId: null, recipientIds: [v.owner_member_id] })]);
    }
    const cleanup = (await env.DB.prepare('SELECT storage_key FROM content_media_cleanup LIMIT 100').all<{
        storage_key: string;
    }>()).results;
    for (const f of cleanup) {
        await env.FILES.delete(f.storage_key);
        await env.DB.prepare('DELETE FROM content_media_cleanup WHERE storage_key=?').bind(f.storage_key).run();
    }
    await env.DB.prepare('DELETE FROM content_presence WHERE expires_at<=?').bind(now).run();
    return { schedules: schedules.length, expiredVerifications: expired.length, removedFiles: cleanup.length };
}
