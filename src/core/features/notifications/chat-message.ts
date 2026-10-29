import type { FeatureContext } from '../../app/feature-context';
import type { OutboxRow } from './events';

/** Only authorized event metadata crosses the chat boundary, including a coalesced routine update. */
export async function chatMessage(ctx: FeatureContext, events: OutboxRow[], appUrl: string): Promise<string> {
  const lines: string[] = [];
  for (const event of events) {
    const actor = await ctx.db.prepare("SELECT display_name FROM members WHERE id=? AND workspace_id=? AND status='active'").bind(event.actor_member_id, event.workspace_id).first<{ display_name: string }>();
    const title = event.page_id
      ? (await ctx.db.prepare("SELECT CASE WHEN p.published_revision_id<>p.working_revision_id THEN json_extract(r.properties_json,'$.title') ELSE p.title END AS title FROM pages p LEFT JOIN page_revisions r ON r.id=p.published_revision_id WHERE p.id=? AND p.deleted_at IS NULL").bind(event.page_id).first<{ title: string }>())?.title
      : event.container_id ? (await ctx.db.prepare('SELECT name AS title FROM containers WHERE id=?').bind(event.container_id).first<{ title: string }>())?.title : undefined;
    const url = new URL(event.page_id ? `/app/pages/${event.page_id}` : event.container_id ? `/app/containers/${event.container_id}` : '/app', appUrl);
    if (event.comment_id) url.searchParams.set('comment', event.comment_id);
    lines.push([event.event, JSON.parse(event.detail_json).agent?.label ?? actor?.display_name ?? 'Slate', title ?? '', url.href].filter(Boolean).join(' · '));
  }
  return lines.join('\n');
}
