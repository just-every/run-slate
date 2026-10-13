import { coverSchema } from './appearance';
import { z } from 'zod';
import type { Context } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { ApiProblem } from '../../app/problems';
const id = z.string().min(1).max(160), op = z.string().min(8).max(160);
const properties = z.object({ title: z.string().max(1000).optional(), icon: z.string().max(1000).nullable().optional(), coverFileId: id.nullable().optional(), cover: coverSchema.nullable().optional(), ownerMemberId: id.nullable().optional(), statusKey: id.nullable().optional(), labels: z.array(z.string().min(1).max(80)).max(100).optional(), typeface: z.enum(['default', 'serif', 'mono']).optional(), smallText: z.boolean().optional(), fullWidth: z.boolean().optional() }).strict();
const block = z.object({ id, blockType: z.string(), content: z.any(), parentBlockId: id.nullable().optional(), treePosition: z.string().min(1).max(200) }).strict();
export const createPageSchema = z.object({ operationKey: op, containerId: id, parentPageId: id.nullable().optional(), title: z.string().max(1000), blocks: z.array(block).optional(), properties: properties.optional(), treePosition: z.string().optional() }).strict();
export const updatePageSchema = z.object({ operationKey: op, expectedRevisionId: id, properties }).strict();
export const updateBlockSchema = z.object({ operationKey: op, expectedRevisionId: id, content: z.any() }).strict();
export const replaceBlocksSchema = z.object({ operationKey: op, expectedRevisionId: id, blocks: z.array(block), blockRevisions: z.record(id, id).optional() }).strict();
export async function validatedJson<T>(c: Context<AppEnvironment>, schema: z.ZodType<T>): Promise<T> {
    const body = await c.req.json().catch(() => { throw new ApiProblem(400, 'INVALID_JSON', 'Provide a JSON object.'); });
    const result = schema.safeParse(body);
    if (!result.success)
        throw new ApiProblem(400, 'INVALID_REQUEST', 'The submitted values are invalid.', { issues: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    return result.data;
}
