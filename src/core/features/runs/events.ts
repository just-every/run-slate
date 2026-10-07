import {deliverAttention} from './attention';
import type {FeatureContext} from '../../app/feature-context';
import type {RunRow} from '../ai/contracts';
import {id,revision,json} from '../ai/persistence';
import {notificationStatements} from '../notifications/events';
export function runEventStatements(ctx:FeatureContext,run:RunRow,event:'run-failed'|'run-review',reason:string,meaningful=false){
 if(JSON.parse(run.input_json).ambientEventId&&!meaningful)return [ctx.db.prepare("UPDATE intelligence_ambient_events SET state='failed',failure_reason=?,updated_at=? WHERE id=?").bind(reason,ctx.now,JSON.parse(run.input_json).ambientEventId),ctx.db.prepare("UPDATE intelligence_interruptions SET state='released',updated_at=? WHERE run_id=? AND state='reserved'").bind(ctx.now,run.id)];
 const stamp=id();return [...deliverAttention(ctx,run,event),revision(ctx,stamp,'run-event',run.id,{event,reason}),ctx.db.prepare('INSERT INTO activity_entries(id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,occurred_at) VALUES(?,?,NULL,?,?,?,?,?,?)').bind(id(),run.workspace_id,'runs',event,'run',run.id,json({reason,pageId:run.page_id,revisionId:stamp}),ctx.now),...notificationStatements(ctx,{id:id(),event,pageId:run.page_id,recipientIds:[run.requester_id],actorId:null,detail:{runId:run.id,sourcePageIds:JSON.parse(run.refs_json).filter((r:{kind:string})=>r.kind==='page').map((r:{sourceId:string})=>r.sourceId)}})];
}
