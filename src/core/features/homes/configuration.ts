import { z } from 'zod';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { configurationStatements } from '../workspace/configuration-history';
import { homeContainerGuard, requireHomeAdministration } from './access';
import { homePageGuards, readableHomePages, verifiedHomePages, workspaceReadablePages } from './pages';

const id = z.string().min(1).max(160);
const pageIds = z.array(id).max(60).refine(ids => new Set(ids).size === ids.length, 'Choose each page once.');
export const containerHomeInput = z.object({
  operationKey: z.string().min(8).max(160), expectedRevisionId: id.nullable(), pageId: id.nullable(),
}).strict();
export const companyHubInput = containerHomeInput.extend({ linkPageIds: pageIds, keyPageIds: pageIds }).strict();

export function setContainerHome(ctx: FeatureContext, containerId: string, input: z.infer<typeof containerHomeInput>) {
  return commitOperation(ctx, {
    operationKey: input.operationKey, action: 'homes.container', request: { containerId, ...input },
    authorize: () => requireHomeAdministration(ctx, containerId),
    prepare: async ({ revisionId }) => {
      const pages = await readableHomePages(ctx, input.pageId ? [input.pageId] : [], containerId);
      if (input.pageId && (!pages[0]?.homeEligible)) throw new ApiProblem(400, 'HOME_PAGE_UNAVAILABLE', 'Choose an existing published page in this space that you can read.');
      return {
        entity: { id: containerId, kind: 'container', revisionId }, value: { pageId: input.pageId, revisionId },
        statements: [homeContainerGuard(ctx, containerId), ...homePageGuards(ctx, pages),
          ...await configurationStatements(ctx, 'container-home', revisionId, input.expectedRevisionId, { pageId: input.pageId }, containerId)],
      };
    },
  });
}

export function setCompanyHub(ctx: FeatureContext, input: z.infer<typeof companyHubInput>) {
  return commitOperation(ctx, {
    operationKey: input.operationKey, action: 'homes.company-hub', request: input,
    authorize: () => requireHomeAdministration(ctx),
    prepare: async ({ revisionId }) => {
      if (!input.pageId && (input.linkPageIds.length || input.keyPageIds.length)) throw new ApiProblem(400, 'HUB_PAGE_REQUIRED', 'Choose the company hub page before adding links.');
      const selected = [...new Set([...(input.pageId ? [input.pageId] : []), ...input.linkPageIds, ...input.keyPageIds])];
      const pages = await readableHomePages(ctx, selected);
      if (pages.length !== selected.length) throw new ApiProblem(400, 'HUB_PAGE_UNAVAILABLE', 'Choose existing published pages that you can read.');
      const hub = pages.find(page => page.id === input.pageId);
      if (input.pageId && !hub?.homeEligible) throw new ApiProblem(400, 'HUB_PAGE_UNAVAILABLE', 'Choose an ordinary published page for the company hub.');
      const [workspaceReadable, verified] = await Promise.all([
        workspaceReadablePages(ctx, hub ? [hub] : []),
        verifiedHomePages(ctx, pages.filter(page => input.keyPageIds.includes(page.id))),
      ]);
      if (hub && !workspaceReadable.has(hub.id)) throw new ApiProblem(400, 'HUB_SHARING_REQUIRED', 'Share the hub page with the workspace using its Share controls, then select it here. Selecting a hub does not change access.');
      if (input.keyPageIds.some(id => !verified.has(id))) throw new ApiProblem(400, 'KEY_PAGE_NOT_VERIFIED', 'Key pages must have a current verification of their published revision.');
      const configuration = { pageId: input.pageId, linkPageIds: input.linkPageIds, keyPageIds: input.keyPageIds };
      return {
        entity: { id: ctx.actor.workspaceId, kind: 'workspace', revisionId }, value: { ...configuration, revisionId },
        statements: [...homePageGuards(ctx, pages),
          ...await configurationStatements(ctx, 'company-hub', revisionId, input.expectedRevisionId, configuration)],
      };
    },
  });
}
