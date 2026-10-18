import {ApiProblem} from '../../app/problems';
import type {ImportRequestContext} from './request-context';
import type {ImportBinding} from './kit-context';
import type {ImportBatchStatement} from './request-budget';

/** Diagnose only a rejected pre-write assertion, never replay the failed batch.
 * Later assertions may depend on rolled-back writes and cannot be read back. */
export async function classifyImportLockRace(ctx:ImportRequestContext,job:ImportBinding,permission:ImportBatchStatement,statements:ImportBatchStatement[],error:unknown):Promise<void> {
  const message=String(error);
  if(!/CHECK constraint failed: (?:accepted\s*=\s*1|IMPORT_ATOMIC_GUARD)|malformed JSON/i.test(message))return;
  const destination='id=? AND revision_id=? AND locked_at IS NULL AND deleted_at IS NULL AND archived_at IS NULL AND trashed_at IS NULL';
  const relaxed='id=? AND locked_at IS NOT NULL AND EXISTS(SELECT 1 FROM (SELECT ? AS expected) base WHERE pages.revision_id=base.expected OR EXISTS(SELECT 1 FROM content_events e WHERE e.page_id=pages.id AND e.revision_id=pages.revision_id AND e.kind=\'locked\' AND json_extract(e.detail_json,\'$.previousRevisionId\')=base.expected)) AND deleted_at IS NULL AND archived_at IS NULL AND trashed_at IS NULL';
  if(!permission.sql.includes(destination))return;
  for(const statement of statements){
    let scalar:string,params=statement.params;
    const native=/^INSERT INTO core_write_guards \(id,accepted\) VALUES \(\?, COALESCE\(\((.*)\),0\)\)$/s.exec(statement.sql);
    const kit=/^INSERT INTO ik_d1_assertions\(ok\) SELECT CASE WHEN \((.*)\) THEN 1 ELSE 0 END$/s.exec(statement.sql);
    const final=/^SELECT CASE WHEN \((.*)\) THEN 1 ELSE json\('IMPORT_FINAL_GUARD'\) END$/s.exec(statement.sql);
    if(native){scalar=native[1];params=params.slice(1);}
    else if(kit)scalar=kit[1];
    else if(final)scalar=final[1];
    else return;
    const accepted=await ctx.db.prepare(`SELECT COALESCE((${scalar}),0) AS accepted`).bind(...params).first<number>('accepted');
    if(accepted)continue;
    // Only the complete admitted authorization predicate may be relaxed. Other
    // packed assertions, session, mappings, generation and access stay exact.
    if(!scalar.includes(permission.sql))return;
    const recheck=scalar.split(permission.sql).join(permission.sql.replace(destination,relaxed));
    if(!await ctx.db.prepare(`SELECT COALESCE((${recheck}),0) AS accepted`).bind(...params).first<number>('accepted'))return;
    const page=await ctx.db.prepare('SELECT locked_at FROM pages WHERE id=? AND workspace_id=? AND deleted_at IS NULL').bind(job.destination_page_id,ctx.actor.workspaceId).first<{locked_at:string|null}>();
    if(page?.locked_at)throw new ApiProblem(409,'PAGE_LOCKED','This page is locked. Unlock it before editing.');
    return;
  }
}
