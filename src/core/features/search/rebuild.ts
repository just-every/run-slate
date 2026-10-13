import type { FeatureContext } from '../../app/feature-context';
import { refreshSearchIndex } from './index';

/** Reconstruct from canonical inventory, including vanished keys and an empty derived store. */
export async function rebuildSearchIndex(ctx:FeatureContext):Promise<number> {
 const workspace=ctx.actor.workspaceId;
 await ctx.db.batch([
  ctx.db.prepare('DELETE FROM search_fts WHERE rowid NOT IN (SELECT rowid FROM search_text)'),
  ctx.db.prepare('DELETE FROM search_record_fts WHERE rowid NOT IN (SELECT rowid FROM search_record_text)'),
  ctx.db.prepare(`INSERT INTO search_dirty(key,workspace_id,generation)
   SELECT key,workspace_id,hex(randomblob(16)) FROM search_text WHERE workspace_id=?
   ON CONFLICT(key) DO UPDATE SET generation=excluded.generation`).bind(workspace),
  ...[
   "SELECT CASE WHEN page_kind='record' THEN 'record:' ELSE 'page:' END||id AS key,workspace_id FROM pages",
   "SELECT 'container:'||id AS key,workspace_id FROM containers",
   "SELECT 'template:'||id AS key,workspace_id FROM knowledge_templates",
   "SELECT 'comment-thread:'||id AS key,workspace_id FROM comment_threads",
  ].map(source=>ctx.db.prepare(`INSERT INTO search_dirty(key,workspace_id,generation) SELECT key,workspace_id,hex(randomblob(16)) FROM (${source}) WHERE workspace_id=? ON CONFLICT(key) DO UPDATE SET generation=excluded.generation`).bind(workspace)),
  ctx.db.prepare('DELETE FROM search_record_cache WHERE workspace_id=?').bind(workspace),
  ctx.db.prepare('DELETE FROM search_record_build WHERE workspace_id=?').bind(workspace),
  ctx.db.prepare('DELETE FROM search_record_text WHERE workspace_id=?').bind(workspace),
 ]);
 return refreshSearchIndex(ctx);
}
