import type { FeatureContext } from '../../app/feature-context';
import { createUlid } from '../../shared/ulid';
import { documents } from './documents';
import { changedSearch, collectRecordBuilds, recordBuild } from './record-build';
import { visibleRecordDocuments } from './record-documents';
import { indexTokens } from './tokens';
import { scalarRecordTypesSql } from './shared-records';

interface Stamp { epoch:number; acl:number; expires:string|null }
async function stamp(ctx:FeatureContext):Promise<Stamp> {
 return (await ctx.db.prepare(`SELECT r.epoch,a.epoch AS acl,(SELECT MIN(expires_at) FROM (
  SELECT g.expires_at FROM page_grants g JOIN pages p ON p.id=g.page_id WHERE p.workspace_id=? AND g.revoked_at IS NULL AND g.expires_at>?
  UNION ALL SELECT g.expires_at FROM container_grants g JOIN containers c ON c.id=g.container_id WHERE c.workspace_id=? AND g.revoked_at IS NULL AND g.expires_at>?
 )) AS expires FROM search_record_epoch r,core_acl_epoch a WHERE r.id=1 AND a.id=1`).bind(ctx.actor.workspaceId,ctx.now,ctx.actor.workspaceId,ctx.now).first<Stamp>())!;
}

/** A member-specific projection is a candidate index, never an authority or result cache.
 * Canonical/dependency writes and ACL changes invalidate it. Time expiry invalidates
 * it without a write. Publication is generation guarded; failed builds are removed.
 */
export async function recordScope(ctx:FeatureContext,includeTrashed:boolean):Promise<string> {
 await collectRecordBuilds(ctx);
 const scope=JSON.stringify([ctx.actor.workspaceId,ctx.actor.id,includeTrashed]),version=await stamp(ctx);
 const previous=await ctx.db.prepare('SELECT generation,epoch,acl,expires_at,as_of FROM search_record_cache WHERE scope=?').bind(scope).first<{generation:string;epoch:number;acl:number;expires_at:string|null;as_of:string}>();
 // A newer request may have evaluated grants after an expiry without an epoch
 // change. Its projection cannot stand in for this request's earlier instant.
 if(previous&&previous.as_of>ctx.now)throw changedSearch();
 if(previous&&previous.epoch===version.epoch&&previous.acl===version.acl&&(!previous.expires_at||previous.expires_at>ctx.now))return previous.generation;
 const generation=createUlid(),build=recordBuild(ctx,scope,generation);let after='';
 try {
 await build.start();
 // Only fields requiring viewer-specific evaluation enter this projection.
 // Scalar records are canonical candidates, still gated by current source ACLs.
 for(;;){
  const keys=(await ctx.db.prepare(`SELECT p.id,'record:'||p.id AS key
   FROM (SELECT DISTINCT database_id FROM database_fields WHERE field_type NOT IN (${scalarRecordTypesSql})) f
   CROSS JOIN database_records d ON d.database_id=f.database_id CROSS JOIN pages p ON p.id=d.page_id
   WHERE p.workspace_id=? AND p.page_kind='record' AND p.deleted_at IS NULL AND p.id>? ORDER BY p.id LIMIT 1000`).bind(ctx.actor.workspaceId,after).all<{id:string;key:string}>()).results;
  if(!keys.length)break;
  const rows=await visibleRecordDocuments(ctx,await documents(ctx,keys.map(r=>r.key)),includeTrashed);
  await build.append(JSON.stringify(rows.map(r=>{
   const title=r.title.toLocaleLowerCase(),text=r.text.toLocaleLowerCase();
   // The prior dynamic query exposed these folded fields in record results.
   return {id:r.id,title,text,document:JSON.stringify({...r,title_fold:title,text_fold:text}),tokens:indexTokens(title,text)};
  })));
  after=keys.at(-1)!.id;
 }
 const end=await stamp(ctx);
 if(end.epoch!==version.epoch||end.acl!==version.acl)throw changedSearch();
 await ctx.db.batch([
  ctx.db.prepare(`INSERT INTO search_record_cache(scope,workspace_id,generation,epoch,acl,expires_at,as_of) SELECT ?,?,?,?,?,?,? WHERE (SELECT epoch FROM search_record_epoch WHERE id=1)=? AND (SELECT epoch FROM core_acl_epoch WHERE id=1)=? AND ${build.owned}
   ON CONFLICT(scope) DO UPDATE SET generation=excluded.generation,epoch=excluded.epoch,acl=excluded.acl,expires_at=excluded.expires_at,as_of=excluded.as_of
   WHERE search_record_cache.epoch<>excluded.epoch OR search_record_cache.acl<>excluded.acl OR search_record_cache.expires_at<=?`).bind(scope,ctx.actor.workspaceId,generation,version.epoch,version.acl,version.expires,ctx.now,version.epoch,version.acl,scope,generation,ctx.now),
  ...build.complete(),
 ]);
 // Concurrent cold builders share the first valid publication. A losing builder
 // removes its own rows in the same transaction, without replacing that winner.
 const ready=await ctx.db.prepare('SELECT generation FROM search_record_cache WHERE scope=? AND epoch=? AND acl=? AND epoch=(SELECT epoch FROM search_record_epoch WHERE id=1) AND acl=(SELECT epoch FROM core_acl_epoch WHERE id=1) AND (expires_at IS NULL OR expires_at>?) AND as_of<=?').bind(scope,version.epoch,version.acl,ctx.now,ctx.now).first<{generation:string}>();
 if(!ready)throw changedSearch();
 return ready.generation;
 } catch(error) {
  await build.abandon();
  throw error;
 }
}
