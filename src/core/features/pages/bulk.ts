import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { archivePage } from '../archive/service';
import { updatePage } from './service';
import { setPageStatus } from '../page-status/service';
import { movePage, previewMove } from './tree';
export async function bulkPages(ctx: FeatureContext, input: {
    operationKey: string;
    pages: {
        id: string;
        expectedRevisionId: string;
    }[];
    action: 'archive' | 'trash' | 'owner' | 'status' | 'move';
    ownerMemberId?: string | null;
    statusKey?: string | null;
    containerId?: string;
    parentPageId?: string | null;
    accessPreviewHashes?: Record<string, string>;
}) {
    if (!Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > 100)
        throw new ApiProblem(400, 'BULK_LIMIT', 'Select between one and 100 pages.');
    const results = [];
    for (const page of input.pages) {
        const base = { operationKey: `${input.operationKey}:${page.id}`, expectedRevisionId: page.expectedRevisionId };
        try {
            let result;
            if (input.action === 'archive' || input.action === 'trash')
                result = await archivePage(ctx, page.id, { ...base, action: input.action });
            else if (input.action === 'owner')
                result = await updatePage(ctx, page.id, { ...base, properties: { ownerMemberId: input.ownerMemberId ?? null } });
            else if (input.action === 'status')
                result = await setPageStatus(ctx, page.id, { ...base, statusKey: input.statusKey ?? null });
            else if (input.action === 'move') {
                if (!input.containerId || !input.accessPreviewHashes?.[page.id])
                    throw new ApiProblem(409, 'MOVE_PREVIEW_REQUIRED', 'Preview each selected page access change first.');
                result = await movePage(ctx, page.id, { ...base, containerId: input.containerId, parentPageId: input.parentPageId, treePosition: `${ctx.now}:${page.id}`, accessPreviewHash: input.accessPreviewHashes[page.id]! });
            }
            else
                throw new ApiProblem(400, 'INVALID_ACTION', 'Unknown bulk action.');
            results.push({ id: page.id, success: true, result });
        }
        catch (e) {
            results.push({ id: page.id, success: false, code: e instanceof ApiProblem ? e.code : 'FAILED', message: e instanceof ApiProblem ? e.message : 'This page could not be changed.' });
        }
    }
    return { items: results };
}
