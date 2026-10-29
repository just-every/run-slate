import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import type {FeatureContext} from '../../app/feature-context';
import {listGrants,saveGrant} from '../sharing/grants';
import {requireContainerAdministration,requirePageLevel} from '../sharing/current-access';
import {grantRecipients} from '../sharing/recipients';
import {readContainer} from '../containers/service';
import {readPage} from '../pages/service';
import {job,id} from './tool';
import {sensitiveKinds} from './classification';

const grant=z.object({targetKind:z.enum(['page','container']),targetId:id,id:id.optional(),principalKind:z.enum(['member','group','container','workspace']),principalId:id,level:z.enum(['view','comment','edit','full']),expiresAt:z.iso.datetime().nullable().optional(),revoke:z.boolean().optional()});
type Input=z.infer<typeof grant>;
const rank={view:1,comment:2,edit:3,full:4};
async function proposed(ctx:FeatureContext,a:Input) {
  if(a.targetKind==='page')await requirePageLevel(ctx,a.targetId,'full');else await requireContainerAdministration(ctx,a.targetId);
  const table=a.targetKind==='page'?'page_grants':'container_grants';
  const prior=a.id?await ctx.db.prepare(`SELECT principal_kind,principal_id,level,expires_at,revoked_at FROM ${table} WHERE id=? AND ${a.targetKind==='page'?'page_id':'container_id'}=?`).bind(a.id,a.targetId).first<{principal_kind:string;principal_id:string;level:keyof typeof rank;expires_at:string|null;revoked_at:string|null}>():null;
  const active=prior&&!prior.revoked_at&&(!prior.expires_at||prior.expires_at>ctx.now);
  const widens=!a.revoke&&(!active||prior.principal_kind!==a.principalKind||prior.principal_id!==a.principalId||rank[a.level]>rank[prior.level]||!!prior.expires_at&&(!a.expiresAt||a.expiresAt>prior.expires_at));
  const recipients=await grantRecipients(ctx,a.principalKind,a.principalId);
  const record=a.targetKind==='page'?await readPage(ctx,a.targetId):await readContainer(ctx,a.targetId);
  const guests=recipients.length?(await ctx.db.prepare("SELECT id FROM members WHERE member_kind='guest' AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(recipients)).all<{id:string}>()).results:[];
  return {widens,recipients,record,guests};
}
export function grantTools(env:AppBindings) {return [
  job(env,{name:'grants.read',title:'Read native record grants',clauses:['SHARE-001','SHARE-008'],schema:z.object({targetKind:z.enum(['page','container']),targetId:id}),readOnly:true,classes:['standard'],classify:async()=>[{class:'standard',facts:{measure:1}}],run:(a,ctx)=>listGrants(ctx,a.targetKind,a.targetId)}),
  job(env,{name:'grants.set',title:'Set or revoke a native record grant',clauses:['SHARE-001','SHARE-002','SHARE-003','SHARE-004','SHARE-005','SHARE-007','SHARE-008','CONT-009','SHARE-009'],schema:grant,readOnly:false,classes:['access','external','sensitive'],
    classify:async(a,ctx)=>{const p=await proposed(ctx,a),kinds=sensitiveKinds(p.record);return [{class:'access',facts:{measure:1,direction:p.widens?'widens':'narrows'}},...(!a.revoke&&p.guests.length?[{class:'external' as const,facts:{measure:p.guests.length,counterparty:'known' as const}}]:[]),...(kinds.length?[{class:'sensitive' as const,facts:{measure:1,kind:kinds.join(', ')}}]:[])];},
    authority:async(a,ctx)=>{const p=await proposed(ctx,a);return {subject:p.recipients.includes(ctx.actor.id)?ctx.actor.id:a.principalId,widens:p.widens};},
    summary:async(a,ctx)=>{const p=await proposed(ctx,a);const people=await ctx.db.prepare('SELECT id,display_name FROM members WHERE workspace_id=?').bind(ctx.actor.workspaceId).all<{id:string;display_name:string}>();return {target:{id:a.targetId,name:a.targetKind},role:a.revoke?'revoked':a.level,recipients:people.results.filter(person=>p.recipients.includes(person.id)).map(person=>person.display_name),items:[a.principalKind,a.principalId]};},
    target:async(a,ctx)=>{await proposed(ctx,a);return {kind:a.targetKind,id:a.targetId};},
    run:(a,ctx,door)=>saveGrant(ctx,{...a,operationKey:'agent:'+door.operationId}),
  }),
];}
