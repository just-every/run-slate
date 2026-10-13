import type { FeatureContext } from '../../app/feature-context';
import type { BlockView } from '../../shared/api/content';
import { labelForReader } from '../pages/mentions';
import { pageBlocks } from '../pages/repository';

interface Thread { anchor_json: string | null; anchor_revision_id: string | null }

/** The text of the spans carrying one comment anchor, as the editor builds a quote (a mention shows its label). */
function anchoredText(value: unknown, anchorId: string, found: string[] = []): string[] {
    if (Array.isArray(value)) value.forEach(item => anchoredText(item, anchorId, found));
    else if (value && typeof value === 'object') {
        const record = value as Record<string, any>;
        if (typeof record.text === 'string' && record.commentAnchorId === anchorId) found.push(record.mention?.label ?? record.text);
        else Object.values(record).forEach(item => anchoredText(item, anchorId, found));
    }
    return found;
}
/** Each page mention's stored label beside the label this reader may see; the two trees have the same shape. */
function mentionLabels(raw: unknown, labelled: unknown, into: Map<string, string>) {
    if (Array.isArray(raw)) raw.forEach((item, index) => mentionLabels(item, (labelled as unknown[])[index], into));
    else if (raw && typeof raw === 'object') {
        const record = raw as Record<string, any>, other = labelled as Record<string, any>;
        if (record.mention?.kind === 'page') {
            const stored = record.mention.label ?? record.text;
            if (stored) into.set(stored, other.text);
        } else Object.entries(record).forEach(([key, item]) => mentionLabels(item, other[key], into));
    }
}
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * LINK-004: an inline comment's quote is the selected text as its author saw it, so it
 * holds each mentioned page's title. For this reader it is rebuilt from the labelled
 * anchored text of the revision the comment was made on (or the page as it stands now);
 * when the anchor no longer matches, each mentioned page's stored title inside the
 * quote is replaced by the label this reader may see.
 */
export async function labelQuotes<T extends Thread>(ctx: FeatureContext, pageId: string, threads: T[]): Promise<T[]> {
    const inline = threads.filter(t => t.anchor_json);
    if (!inline.length) return threads;
    const revisions: Record<string, BlockView[]> = {};
    for (const id of new Set(inline.map(t => t.anchor_revision_id).filter((id): id is string => !!id))) {
        const row = await ctx.db.prepare('SELECT body_json FROM page_revisions WHERE id=? AND page_id=? AND deleted_at IS NULL').bind(id, pageId).first<{ body_json: string }>();
        if (row) revisions[id] = JSON.parse(row.body_json);
    }
    const raw = { current: await pageBlocks(ctx.db, pageId), revisions };
    const labelled = await labelForReader(ctx, raw);
    const labels = new Map<string, string>();
    mentionLabels(raw, labelled, labels);
    const substitute = (quote: string) => labels.size ? quote.replace(new RegExp([...labels.keys()].sort((a, b) => b.length - a.length).map(escape).join('|'), 'g'), stored => labels.get(stored)!) : quote;
    return threads.map(thread => {
        if (!thread.anchor_json) return thread;
        const anchor = JSON.parse(thread.anchor_json) as { anchorId?: string; quote?: string };
        if (typeof anchor.quote !== 'string' || !anchor.quote) return thread;
        const sources = [thread.anchor_revision_id && revisions[thread.anchor_revision_id] ? { raw: revisions[thread.anchor_revision_id]!, labelled: labelled.revisions[thread.anchor_revision_id!]! } : undefined, { raw: raw.current, labelled: labelled.current }];
        const match = anchor.anchorId ? sources.find(s => s && anchoredText(s.raw, anchor.anchorId!).join('') === anchor.quote) : undefined;
        const quote = match ? anchoredText(match.labelled, anchor.anchorId!).join('') : substitute(anchor.quote);
        return quote === anchor.quote ? thread : { ...thread, anchor_json: JSON.stringify({ ...anchor, quote }) };
    });
}
