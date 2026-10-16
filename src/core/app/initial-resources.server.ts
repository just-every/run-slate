import type { FeatureContext } from './feature-context';
import type { InitialResources } from '../client/InitialResources';
import { ApiProblem } from './problems';
import { listPages } from '../features/pages/tree';
import { readPage } from '../features/pages/service';
import { openPage } from '../features/pages/open';
import { listDatabases } from '../features/databases/discovery';
import { listContainers } from '../features/containers/service';
import { currentMember, listMembers } from '../features/workspace/members';
import { reviewCount, reviewQueue } from '../features/page-status/review';
import { listTemplates } from '../features/templates/service';
import { savedSearches } from '../features/search/saved';
import { notificationList } from '../features/notifications/service';
import { listComments } from '../features/comments/service';
import { listArchive } from '../features/archive/list';
import { publishingExposure } from '../features/publishing/exposure';
import { statusEntries } from '../features/page-status/entries';

/** Same authorized reads as the API, in parallel, scoped to one document. */
export async function initialResources(ctx: FeatureContext, url: URL, recordVisit=false): Promise<InitialResources> {
  const resources: InitialResources = {};
  const reads: Promise<void>[] = [];
  const add = (path: string, read: () => Promise<unknown>) => {
    reads.push(read().then(value => { resources[path] = value; }).catch(cause => {
      // Leave the ordinary resource error boundary in charge of denied reads.
      if (!(cause instanceof ApiProblem)) throw cause;
    }));
  };
  add('/api/pages', () => listPages(ctx));
  add('/api/databases', () => listDatabases(ctx));
  add('/api/containers', () => listContainers(ctx));
  add('/api/status/review/count', () => reviewCount(ctx));
  add('/api/members/current', () => currentMember(ctx));
  if (url.pathname === '/app/search') {
    add('/api/members', () => listMembers(ctx, 'member'));
    add('/api/status', () => statusEntries(ctx));
    add('/api/search/saved?updated=0', async () => ({ items: await savedSearches(ctx) }));
  } else if (url.pathname === '/app/containers' || url.pathname === '/app/containers/') {
    add('/api/containers?archived=false', () => listContainers(ctx, false));
  } else if (url.pathname === '/app/templates' || url.pathname === '/app/templates/') {
    add('/api/templates?state=active&query=&category=&containerId=', () => listTemplates(ctx, { state: 'active', query: '', category: '', containerId: '' }));
  } else if (url.pathname === '/app/inbox') {
    add('/api/notifications?audience=', () => notificationList(ctx, {}));
  } else if (url.pathname === '/app/review') {
    add('/api/status/review?filter=everyone', () => reviewQueue(ctx, { filter: 'everyone' }));
  } else if (url.pathname === '/app/archive') {
    add('/api/archive', () => listArchive(ctx));
  }
  const page = /^\/app\/pages\/([^/]+)$/.exec(url.pathname);
  if (page) {
    const id = decodeURIComponent(page[1]);
    add(`/api/pages/${encodeURIComponent(id)}`, async () => {
      const document=await readPage(ctx,id);
      if(recordVisit) {
        const sessionId=crypto.randomUUID(), epoch=ctx.authorizationEpoch!;
        const opened=await openPage({...ctx},id,{operationKey:crypto.randomUUID(),revisionId:['edit','full'].includes(document.permissions.level)?document.workingRevisionId:document.publishedRevisionId??document.workingRevisionId},{document,authorizationEpoch:epoch,sessionId});
        resources[`/api/pages/${id}/opened`]={sessionId,recent:{id:document.page.id,title:document.page.title,containerId:document.page.containerId,icon:document.properties.icon,openedAt:ctx.now,...Object.fromEntries(['publishAt','scheduleState','scheduleFailure'].filter(key=>key in document.page).map(key=>[key,(document.page as unknown as Record<string,unknown>)[key]]))}};
        resources[`/api/collaboration/${id}?after=0`]=opened.collaboration;
      }
      return document;
    });
    add('/api/status', () => statusEntries(ctx));
    add(`/api/comments/page/${id}`, () => listComments(ctx, id));
    add(`/api/publishing/${id}`, () => publishingExposure(ctx, id));
  }
  await Promise.all(reads);
  return resources;
}
