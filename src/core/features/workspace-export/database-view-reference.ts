import type { FeatureContext } from '../../app/feature-context';
import type { BlockView } from '../../shared/api/content';
import { ApiProblem } from '../../app/problems';
import { readDatabase } from '../databases/reads';
import { readPage } from '../pages/service';

/** Readable snapshots carry a named reference, never a query or its records. */
export async function databaseViewReferences(ctx: FeatureContext, blocks: BlockView[]): Promise<BlockView[]> {
  return Promise.all(blocks.map(async block => {
    if (block.blockType !== 'database-view') return block;
    const definition = (block.content as { definition: { databaseId?: string; viewId?: string } }).definition;
    let text = 'Database view unavailable';
    if (definition.databaseId && definition.viewId) {
      try {
        const source = await readDatabase(ctx, definition.databaseId);
        const view = source.views.find(view => view.id === definition.viewId);
        if (view) {
          const page = await readPage(ctx, source.database.page_id);
          text = `Database view: ${page.page.title} — ${view.name}`;
        }
      } catch (error) {
        if (!(error instanceof ApiProblem) || error.status !== 404) throw error;
      }
    }
    return { ...block, blockType: 'paragraph', content: { text: [{ text }] } };
  }));
}
