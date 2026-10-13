import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';

// A stalled invocation loses ownership after five minutes without a completed
// chunk. Both writes and publication are fenced by this database-clock lease;
// an invocation that resumes after collection cannot recreate an orphan.
const leaseSeconds=300;
export function changedSearch():ApiProblem {
 return new ApiProblem(409,'SEARCH_CHANGED','Content or access changed while preparing search. Start a fresh search.');
}

export async function collectRecordBuilds(ctx:FeatureContext):Promise<void> {
 await ctx.db.batch([
  ctx.db.prepare(`DELETE FROM search_record_text WHERE workspace_id=? AND (scope,generation) IN (
   SELECT scope,generation FROM search_record_build WHERE workspace_id=? AND expires_at<=unixepoch() ORDER BY expires_at LIMIT 32
  ) AND NOT EXISTS(SELECT 1 FROM search_record_cache c WHERE c.scope=search_record_text.scope AND c.generation=search_record_text.generation)`).bind(ctx.actor.workspaceId,ctx.actor.workspaceId),
  // A lease can expire between these two statements. Keep its metadata if the
  // first statement did not yet collect its rows; a later sweep will do both.
  ctx.db.prepare(`DELETE FROM search_record_build WHERE workspace_id=? AND expires_at<=unixepoch()
   AND NOT EXISTS(SELECT 1 FROM search_record_text t WHERE t.scope=search_record_build.scope AND t.generation=search_record_build.generation)`).bind(ctx.actor.workspaceId),
 ]);
}

export function recordBuild(ctx:FeatureContext,scope:string,generation:string) {
 const owned=`EXISTS(SELECT 1 FROM search_record_build WHERE scope=? AND generation=? AND expires_at>unixepoch())`;
 return {
  owned,
  start:()=>ctx.db.prepare(`INSERT INTO search_record_build(scope,generation,workspace_id,expires_at) VALUES(?,?,?,unixepoch()+?)`).bind(scope,generation,ctx.actor.workspaceId,leaseSeconds).run(),
  async append(rows:string) {
   const [renewed]=await ctx.db.batch([
    ctx.db.prepare(`UPDATE search_record_build SET expires_at=unixepoch()+? WHERE scope=? AND generation=? AND expires_at>unixepoch()`).bind(leaseSeconds,scope,generation),
    ctx.db.prepare(`INSERT INTO search_record_text(scope,generation,workspace_id,key,title_fold,text_fold,tokens,document_json)
     SELECT ?,?,?,'record:'||json_extract(value,'$.id'),json_extract(value,'$.title'),json_extract(value,'$.text'),json_extract(value,'$.tokens'),json_extract(value,'$.document') FROM json_each(?) WHERE ${owned}`).bind(scope,generation,ctx.actor.workspaceId,rows,scope,generation),
   ]);
   if(!renewed.meta.changes)throw changedSearch();
  },
  // Publication runs these in its transaction. No other live builder is erased,
  // including builders that captured the same previous cache generation.
  complete:()=>[
   ctx.db.prepare('DELETE FROM search_record_build WHERE scope=? AND generation=?').bind(scope,generation),
   ctx.db.prepare(`DELETE FROM search_record_text WHERE scope=?
    AND NOT EXISTS(SELECT 1 FROM search_record_cache c WHERE c.scope=search_record_text.scope AND c.generation=search_record_text.generation)
    AND NOT EXISTS(SELECT 1 FROM search_record_build b WHERE b.scope=search_record_text.scope AND b.generation=search_record_text.generation)`).bind(scope),
  ],
  async abandon() {
   await ctx.db.batch([
    ctx.db.prepare(`DELETE FROM search_record_text WHERE scope=? AND generation=?
     AND NOT EXISTS(SELECT 1 FROM search_record_cache c WHERE c.scope=search_record_text.scope AND c.generation=search_record_text.generation)`).bind(scope,generation),
    ctx.db.prepare('DELETE FROM search_record_build WHERE scope=? AND generation=?').bind(scope,generation),
   ]);
  },
 };
}
