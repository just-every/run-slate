import type { FeatureContext } from '../../app/feature-context';
import type { BlockView } from '../../shared/api/content';
import { formatSelection } from '../editor/ui/formatSelection';
import { richTextToPlain, type RichText } from '../editor/ui/types';

/** Render comment annotations without granting their authors a content write. */
export async function selectionAnchors(ctx: FeatureContext, pageId: string, blocks: BlockView[]): Promise<BlockView[]> {
    const threads = await ctx.db.prepare("SELECT block_id,anchor_json FROM comment_threads WHERE page_id=? AND kind='inline' AND orphaned=0")
        .bind(pageId).all<{block_id:string;anchor_json:string}>();
    return blocks.map(block => {
        const content = block.content as {text?:RichText};
        if (!Array.isArray(content?.text)) return block;
        let text = content.text;
        for (const thread of threads.results.filter(thread => thread.block_id === block.id)) {
            const anchor = JSON.parse(thread.anchor_json) as {anchorId:string;quote:string;start?:number;end?:number};
            if (text.some(span => span.commentAnchorId === anchor.anchorId)) continue;
            if (!Number.isInteger(anchor.start) || !Number.isInteger(anchor.end)) continue;
            const plain = richTextToPlain(text);
            if (plain.slice(anchor.start, anchor.end) !== anchor.quote) continue;
            text = formatSelection(text, anchor.start!, anchor.end!, span => ({...span,commentAnchorId:anchor.anchorId}));
        }
        return text === content.text ? block : {...block,content:{...content,text} as unknown as BlockView['content']};
    });
}
