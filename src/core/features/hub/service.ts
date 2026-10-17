import type { FeatureContext } from '../../app/feature-context';
import { postFeed } from '../blog/feed';
import { currentSubject } from '../sharing/current-access';
import { storedHub, hubSections } from './configuration';
import { hubPages } from './pages';
import type { HubView } from './types';

export async function readHub(ctx: FeatureContext): Promise<HubView | null> {
  const subject = await currentSubject(ctx);
  if (subject.isGuest) return null;
  const {configuration} = await storedHub(ctx);
  const [available, feed, owner] = await Promise.all([
    hubPages(ctx, hubSections.flatMap(field => configuration[field])),
    postFeed(ctx, {pageIds:configuration.announcementPageIds}),
    ctx.db.prepare("SELECT id FROM members WHERE id=? AND workspace_id=? AND status='active' AND member_kind='member' AND role='owner'").bind(ctx.actor.id,ctx.actor.workspaceId).first(),
  ]);
  const pages = new Map(available.map(page => [page.id,page]));
  const ordered = (ids:string[]) => ids.flatMap(id => pages.has(id) ? [pages.get(id)!] : []);
  return {title:configuration.title,description:configuration.description,links:ordered(configuration.linkPageIds),
    announcements:feed.items.filter(post => pages.has(post.pageId)).map(({pageId,title,containerId,containerName,postedAt,authorName})=>({pageId,title,containerId,containerName,postedAt,authorName})),keyPages:ordered(configuration.keyPageIds).filter(page => page.verified),canManage:!!owner};
}
