import type { BlockView } from '../../shared/api/content';
import type { JsonValue } from '../../shared/api/common';
import { formatSelection } from '../editor/ui/formatSelection';
import type { RichText } from '../editor/ui/types';

interface Thread { id: string; block_id: string | null; anchor_json: string }
type Located = { rich: RichText; offset: number };

const isRich = (value: unknown): value is RichText => Array.isArray(value) && value.length > 0 && value.every(span => span && typeof span === 'object' && typeof (span as { text?: unknown }).text === 'string');
const plain = (rich: RichText) => rich.map(span => span.mention?.label ?? span.text).join('');

/** Every rich-text run in a block's content, in document order. */
function runs(value: unknown, found: RichText[] = []): RichText[] {
    if (isRich(value)) found.push(value);
    else if (Array.isArray(value)) value.forEach(item => runs(item, found));
    else if (value && typeof value === 'object') Object.values(value).forEach(item => runs(item, found));
    return found;
}
/** Where an anchor's span currently starts: its run and plain-text offset. */
function locate(content: JsonValue, anchorId: string): Located | undefined {
    for (const rich of runs(content)) {
        let offset = 0;
        for (const span of rich) {
            if (span.commentAnchorId === anchorId) return { rich, offset };
            offset += (span.mention?.label ?? span.text).length;
        }
    }
}
/** Replaces one run inside a block's content with its re-anchored copy. */
function replaceRun(value: JsonValue, from: RichText, to: RichText): JsonValue {
    if (value === (from as unknown)) return to as unknown as JsonValue;
    if (Array.isArray(value)) return value.map(item => replaceRun(item, from, to));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceRun(item as JsonValue, from, to)]));
    return value;
}

/**
 * COMM-004 and REV-003: restoring an earlier revision keeps every inline thread
 * that is anchored in the current text. A thread whose span the restored block
 * lacks is re-anchored on its quote, at the occurrence nearest its current
 * place; it is left orphaned only when the quote is not in that block.
 */
export function carryAnchors(current: BlockView[], restored: BlockView[], threads: Thread[]): BlockView[] {
    const byId = new Map(restored.map(block => [block.id, block]));
    for (const thread of threads) {
        const anchor = JSON.parse(thread.anchor_json) as { anchorId?: string; quote?: string };
        if (!anchor.anchorId || !anchor.quote) continue;
        const now = current.find(block => block.id === thread.block_id), was = now && locate(now.content, anchor.anchorId);
        const target = thread.block_id ? byId.get(thread.block_id) : undefined;
        if (!was || !target || locate(target.content, anchor.anchorId)) continue;
        let best: { rich: RichText; at: number } | undefined;
        for (const rich of runs(target.content)) {
            const text = plain(rich);
            for (let at = text.indexOf(anchor.quote); at >= 0; at = text.indexOf(anchor.quote, at + 1))
                if (!best || Math.abs(at - was.offset) < Math.abs(best.at - was.offset)) best = { rich, at };
        }
        if (!best) continue;
        const anchored = formatSelection(best.rich, best.at, best.at + anchor.quote.length, span => ({ ...span, commentAnchorId: anchor.anchorId }));
        // A quote that only spans a mention cannot carry the anchor; leave the thread to orphan.
        if (!anchored.some(span => span.commentAnchorId === anchor.anchorId)) continue;
        byId.set(target.id, { ...target, content: replaceRun(target.content, best.rich, anchored) });
    }
    return restored.map(block => byId.get(block.id)!);
}
