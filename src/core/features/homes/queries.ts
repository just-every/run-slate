import type { FeatureContext } from '../../app/feature-context';
import { readContainer } from '../containers/queries';
import { currentSubject } from '../sharing/current-access';
import { configurationHistory } from '../workspace/configuration-history';
import { isHubOwner, requireHomeAdministration } from './access';
import { homePageLink, readableHomePages, verifiedHomePages, workspaceReadablePages } from './pages';
import type { CompanyHubConfiguration, CompanyHubView, ContainerHomeConfiguration, HomePageChoice, HomeView } from './types';

export async function containerHome(ctx: FeatureContext, id: string): Promise<HomeView> {
  const container = await readContainer(ctx, id);
  const row = await configurationHistory<ContainerHomeConfiguration>(ctx, 'container-home', id);
  const canConfigure = container.permissions.canManage && !container.archivedAt && !container.trashedAt;
  const pages = await readableHomePages(ctx, row?.value.pageId ? [row.value.pageId] : [], id);
  const page = pages.find(page => page.homeEligible);
  return {
    state: !row?.value.pageId ? 'unconfigured' : page ? 'ready' : 'unavailable',
    ...(page ? { page: homePageLink(page) } : {}), canConfigure,
    ...(canConfigure ? { configuration: { revisionId: row?.revisionId ?? null, pageId: row?.value.pageId ?? null } } : {}),
  };
}

export async function companyHub(ctx: FeatureContext): Promise<CompanyHubView> {
  await currentSubject(ctx);
  const [canConfigure, row] = await Promise.all([
    isHubOwner(ctx), configurationHistory<CompanyHubConfiguration>(ctx, 'company-hub'),
  ]);
  // Core erasure deliberately replaces a revision's content with {}. A removed
  // configuration is explicit recovery state, never a reason to expose older links.
  if (row && Object.keys(row.value).length === 0) return {
    state: 'unavailable', canConfigure, links: [], keyPages: [],
    ...(canConfigure ? { configuration: { revisionId: row.revisionId, pageId: null, linkPageIds: [], keyPageIds: [] } } : {}),
  };
  const value: CompanyHubConfiguration = row?.value ?? { pageId: null, linkPageIds: [], keyPageIds: [] };
  const pages = await readableHomePages(ctx, [...new Set([...(value.pageId ? [value.pageId] : []), ...value.linkPageIds, ...value.keyPageIds])]);
  const page = pages.find(page => page.id === value.pageId && page.homeEligible);
  const byId = new Map(pages.map(page => [page.id, page]));
  const verified = await verifiedHomePages(ctx, pages.filter(page => value.keyPageIds.includes(page.id)));
  // No unavailable title, ID, placeholder or count crosses the reader boundary.
  return {
    state: !value.pageId ? 'unconfigured' : page ? 'ready' : 'unavailable',
    ...(page ? { page: homePageLink(page) } : {}), canConfigure,
    links: page ? value.linkPageIds.flatMap(id => byId.has(id) ? [homePageLink(byId.get(id)!)] : []) : [],
    keyPages: page ? value.keyPageIds.flatMap(id => byId.has(id) && verified.has(id) ? [homePageLink(byId.get(id)!)] : []) : [],
    ...(canConfigure ? { configuration: { revisionId: row?.revisionId ?? null, pageId: value.pageId, linkPageIds: value.linkPageIds, keyPageIds: value.keyPageIds } } : {}),
  };
}

/** This is a configuration picker; it never lists pages on an administrator's behalf. */
export async function homeChoices(ctx: FeatureContext, containerId?: string): Promise<{ items: HomePageChoice[] }> {
  await requireHomeAdministration(ctx, containerId);
  const pages = await readableHomePages(ctx, undefined, containerId);
  const [readable, verified] = await Promise.all([workspaceReadablePages(ctx, pages), verifiedHomePages(ctx, pages)]);
  return { items: pages.map(page => ({ ...homePageLink(page), homeEligible: page.homeEligible, workspaceReadable: readable.has(page.id), verified: verified.has(page.id) }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)) };
}
