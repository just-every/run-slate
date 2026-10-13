import {retireD1ImportCustody,type D1ImportContext,type D1Sql} from '../../../../modules/import-kit/src/d1/index.ts';
import {mutationGuard} from '../../app/operations';
import type {FeatureContext} from '../../app/feature-context';
import {installationRedactionStatements} from '../portability/checkpoint';
import {erasureTransaction} from './erasure-transaction';
import {nativeTargets,type NativeImportBinding} from './native-targets';

const scopes=new WeakMap<D1Database,D1Sql[]>();
export function registerImportErasure(ctx:FeatureContext,sql:string,params:unknown[]) {
  const pending=scopes.get(ctx.db);
  if(!pending)throw new Error('Import erasure requires an atomic native transaction.');
  pending.push({sql,params});
}

/** Compose each destination's genuine Kit batch around the native mutation.
 * All reads happen first; the innermost adapter sends exactly one batch to D1.
 * A failed native guard therefore rolls back every retirement and checkpoint. */
export function beginImportErasure(original:FeatureContext,operationKey:string) {
  const capture=erasureTransaction(original.db),pending:D1Sql[]=[];
  scopes.set(capture.db,pending);
  const ctx={...original,db:capture.db};
  const commit=async(statements:D1PreparedStatement[])=>{
    const found=new Map<string,NativeImportBinding>(),guards:D1Sql[]=[];
    for(const scope of pending){
      const rows=(await original.db.prepare(`SELECT id,created_at,native_published FROM federation_imports WHERE id IN (${scope.sql})`).bind(...scope.params??[]).all<NativeImportBinding>()).results;
      for(const row of rows)found.set(row.id,row);
      guards.push(capture.statement(mutationGuard(capture.db,`SELECT (SELECT COALESCE(json_group_array(id),'[]') FROM (SELECT id FROM federation_imports WHERE id IN (${scope.sql}) ORDER BY id))=?`,[...scope.params??[],JSON.stringify(rows.map(row=>row.id).sort())] as (string|number|null)[])));
    }
    const checkpoint=(await installationRedactionStatements(capture.db,ctx.files)).map(capture.statement);
    if(!found.size)return original.db.batch([...guards,...statements.map(capture.statement),...checkpoint].map(capture.prepare));
    const checkpointState=(await original.db.prepare('SELECT source_identity,epoch FROM rer_portability_state WHERE id=1').first<{source_identity:string;epoch:number}>())!;
    const destinations:NativeImportBinding[]=[];
    const custody='SELECT 1 FROM ik_jobs WHERE destination=? UNION ALL SELECT 1 FROM ik_d1_streams WHERE destination=? UNION ALL SELECT 1 FROM ik_d1_staging WHERE destination=?';
    for(const row of found.values()){
      if(await original.db.prepare(custody+' LIMIT 1').bind(row.id,row.id,row.id).first())destinations.push(row);
      else guards.push(capture.statement(mutationGuard(capture.db,`SELECT NOT EXISTS(${custody})`,[row.id,row.id,row.id])));
    }
    const commitAt=async(index:number,native:D1Sql[]):Promise<unknown[]>=>{
      if(index===destinations.length)return original.db.batch(native.map(capture.prepare));
      const destination=destinations[index]!,stage=erasureTransaction(original.db);
      const database={prepare:stage.db.prepare,batch:async(batch:D1PreparedStatement[])=>{
        const queries=batch.map(stage.statement);
        // Kit admission reads use batch too. They must remain actual reads,
        // never trigger the composition of the eventual mutation transaction.
        if(queries.every(query=>/^\s*(?:SELECT|WITH)\b/i.test(query.sql)))return stage.db.batch(batch);
        return commitAt(index+1,queries);
      }};
      const context:D1ImportContext={
        destination:destination.id,namespace:'slate-native-import',mappingVersion:'slate-native-v1',operationKey:`slate:${destination.id}`,
        storage:{database,targets:nativeTargets(destination,()=>0)},
        authorization:{principalId:ctx.actor.id,predicate:()=>({
          // Native commitOperation carries the exact ACL epoch, active actor and
          // fresh session proof guards. Self-erasure revokes its own session;
          // after that transition only this operation's receipt admits closure.
          sql:"EXISTS(SELECT 1 FROM members WHERE id=? AND workspace_id=? AND status='active') OR EXISTS(SELECT 1 FROM operation_receipts WHERE workspace_id=? AND actor_member_id=? AND operation_key=?)",
          params:[ctx.actor.id,ctx.actor.workspaceId,ctx.actor.workspaceId,ctx.actor.id,operationKey],
        })},
      };
      // The first retirement's checkpoint is inside every later native batch.
      // Base invalidation drops retained transfer tables, so execute it once;
      // later retirements assert that shared restore fence in the same batch.
      const fence=index===0?checkpoint:[capture.statement(mutationGuard(capture.db,
        'SELECT EXISTS(SELECT 1 FROM rer_portability_state s JOIN rer_portability_epochs e ON e.source=s.source_identity WHERE s.id=1 AND s.source_identity=? AND s.epoch=? AND e.epoch>=s.epoch)',
        [checkpointState.source_identity,checkpointState.epoch+1]))];
      const entry=await retireD1ImportCustody({values:['slate-native-import']},native,context,fence);
      return entry.nativeResults;
    };
    return commitAt(0,[...guards,...statements.map(capture.statement),...(!destinations.length?checkpoint:[])]);
  };
  return {ctx,commit};
}
