import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {listGroups,saveGroup} from '../workspace/groups';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {job,id,nativeOperation,standard} from './tool';
const schema=z.object({id:id.optional(),name:z.string().trim().min(1).max(160),memberIds:z.array(id).max(1000),remove:z.boolean().optional()});
async function effect(a:z.infer<typeof schema>,ctx:FeatureContext) {
 await requireWorkspaceOwner(ctx);
 const current=a.id?(await listGroups(ctx)).items.find(group=>group.id===a.id):null;
 if(a.id&&!current)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 const before=current?.memberIds??[],after=a.remove?[]:[...new Set(a.memberIds)];
 const added=after.filter(id=>!before.includes(id)),removed=before.filter(id=>!after.includes(id));
 const people=(await ctx.db.prepare("SELECT id,display_name FROM members WHERE workspace_id=? AND status='active' AND member_kind='member' AND id IN (SELECT value FROM json_each(?))").bind(ctx.actor.workspaceId,JSON.stringify([...new Set([...before,...after])])).all<{id:string;display_name:string}>()).results;
 if(after.some(id=>!people.some(person=>person.id===id)))throw new ApiProblem(404,'NOT_FOUND','Not found.');
 return {current,added,removed,people};
}
export function groupTools(env:AppBindings) {return [
 job(env,{name:'groups.list',title:'List native access groups and their current members',clauses:['WORK-009'],schema:z.object({}),readOnly:true,classes:['standard'],classify:standard,run:(_,c)=>listGroups(c)}),
 job(env,{name:'groups.manage',title:'Create, update or remove a native access group',clauses:['WORK-009'],schema,readOnly:false,classes:['standard','access'],classify:async(a,c)=>{const p=await effect(a,c);return p.added.length||p.removed.length?[{class:'access',facts:{measure:new Set([...p.added,...p.removed]).size,direction:p.added.length?'widens':'narrows'}}]:standard();},authority:async(a,c)=>{const p=await effect(a,c);return {subject:p.added.includes(c.actor.id)?c.actor.id:p.added[0]??p.removed[0]??a.id??c.actor.workspaceId,widens:p.added.length>0};},target:async(a,c)=>{const p=await effect(a,c);return p.current?{kind:'group',id:p.current.id}:null;},revision:async(a,c)=>(await effect(a,c)).current?.revisionId??null,summary:async(a,c)=>{const p=await effect(a,c);return {target:{id:a.id,name:a.name},recipients:p.people.filter(person=>p.added.includes(person.id)||p.removed.includes(person.id)).map(person=>person.display_name),items:[a.remove?'Remove group':'Save group',a.name],role:p.added.length?'Add members':p.removed.length?'Remove members':'Keep membership'};},run:(a,c,d)=>saveGroup(c,{...a,...nativeOperation(d),expectedRevisionId:c.agentRevision})}),
];}
