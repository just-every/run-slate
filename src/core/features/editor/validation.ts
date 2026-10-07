import { contentLimits } from './limits';
import { z } from 'zod';
import { ApiProblem } from '../../app/problems';
import type { JsonValue } from '../../shared/api/common';
import type { BlockInput } from '../pages/types';
export const safeUrl = (value: string) => {
    try {
        const u = new URL(value);
        return ['https:', 'http:', 'mailto:'].includes(u.protocol) && !u.username && !u.password;
    }
    catch {
        return value.startsWith('/app/') || value.startsWith('/api/media/');
    }
};
const span = z.object({ text: z.string(), marks: z.array(z.enum(['bold', 'italic', 'underline', 'strikethrough', 'code'])).optional(), colour: z.enum(['yellow', 'blue', 'green', 'red', 'purple']).optional(), link: z.object({ href: z.string().refine(safeUrl) }).optional(), mention: z.object({ kind: z.enum(['person', 'page', 'date']), label: z.string().optional(), id: z.string().optional() }).optional(), commentAnchorId: z.string().optional() }).strict().transform(value => value.mention ? {...value, mention: {...value.mention, label: value.mention.label ?? value.text}} : value);
const rich = z.array(span);
const schemas: Record<string, z.ZodType> = {
    paragraph: z.object({ text: rich }), heading: z.object({ text: rich, level: z.number().int().min(1).max(3), number: z.string().optional() }),
    list: z.object({ variant: z.enum(['bulleted', 'numbered', 'toggle']), start: z.number().int().optional(), items: z.array(z.object({ id: z.string(), text: rich, open: z.boolean().optional(), detail: rich.optional() })) }),
    quote: z.object({ text: rich, attribution: z.string().optional() }), divider: z.object({}), callout: z.object({ text: rich, tone: z.enum(['neutral', 'accent', 'good', 'warn', 'danger']), icon: z.string().optional() }),
    expandable: z.object({ summary: z.string(), open: z.boolean(), content: rich }), table: z.object({ caption: z.string().optional(), columns: z.array(z.string()), rows: z.array(z.object({ id: z.string(), cells: z.array(z.string()) })) }),
    code: z.object({ language: z.string(), languages: z.array(z.string()).optional(), code: z.string() }), task: z.object({ text: rich, done: z.boolean(), completedBy: z.unknown().optional(), completedAtLabel: z.string().optional(), completedByMemberId: z.string().nullable().optional(), completedAt: z.string().nullable().optional() }),
    media: z.object({ kind: z.enum(['image', 'video', 'audio', 'file']), source: z.object({ url: z.string().refine(safeUrl), name: z.string(), fileId: z.string().optional(), sizeLabel: z.string().optional(), contentType: z.string().optional() }).nullable(), caption: z.string(), alt: z.string() }),
    'link-card': z.object({ url: z.string().refine(safeUrl), display: z.enum(['plain', 'inline', 'card']), previewState: z.enum(['ready', 'loading', 'refused', 'failed']), preview: z.object({ title: z.string(), description: z.string().optional(), siteName: z.string().optional(), iconLabel: z.string().optional() }).optional(), previewMessage: z.string().optional() }),
    'content-query': z.object({ definition: z.object({ container: z.string().optional(), ancestor: z.string().optional(), pageType: z.string().optional(), status: z.string().optional(), contributor: z.string().optional(), dateRange: z.string().optional(), orderBy: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }) }),
};
export function validateBlockContent(type: string, content: JsonValue): JsonValue {
    const schema = schemas[type];
    if (!schema)
        throw new ApiProblem(400, 'INVALID_BLOCK', 'Unsupported block type.');
    const result = schema.safeParse(content);
    if (!result.success)
        throw new ApiProblem(400, 'INVALID_BLOCK', 'Invalid block content.', { issues: result.error.issues.map(i => i.message) });
    return result.data as JsonValue;
}
export function validateBlockTree(blocks: BlockInput[]): BlockInput[] {
    if (blocks.length > contentLimits.capacityEstimate.blocksPerPage)
        throw new ApiProblem(413, 'BODY_LIMIT', 'Too many blocks.');
    const map = new Map(blocks.map(b => [b.id, b]));
    if (map.size !== blocks.length)
        throw new ApiProblem(400, 'DUPLICATE_BLOCK', 'Block IDs must be unique.');
    return blocks.map(b => {
        if (!b.id || !b.treePosition || b.id.length > 160)
            throw new ApiProblem(400, 'INVALID_BLOCK', 'Block ID and order are required.');
        let p = b.parentBlockId;
        const seen = new Set([b.id]);
        while (p) {
            if (seen.has(p) || !map.has(p))
                throw new ApiProblem(400, 'INVALID_BLOCK_TREE', 'Block parent is missing or cyclic.');
            seen.add(p);
            p = map.get(p)!.parentBlockId;
        }
        return { ...b, content: validateBlockContent(b.blockType, b.content) };
    });
}
export function plainContent(value: unknown): string {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value))
        return value.map(plainContent).join(' ');
    if(value&&typeof value==='object'&&'mention' in value){const span=value as {mention?:{label?:string};text?:string};return span.mention?.label??span.text??'';} if (value && typeof value === 'object')
        return Object.entries(value).filter(([k]) => ['text', 'code', 'summary', 'content', 'cells', 'rows', 'columns', 'caption', 'alt', 'items', 'detail', 'attribution'].includes(k)).map(([, v]) => plainContent(v)).join(' ');
    return '';
}
