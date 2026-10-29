import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import {restorePageRevision,readRevision} from '../versions/service';
import {discardChanges} from '../lifecycle/service';
import {readPage} from '../pages/service';
import {contentQuery} from '../pages/content-query';
import {contentQueryDefinitionSchema} from '../editor/query-definition';
import {job,id,nativeOperation,standard} from './tool';
import {pageFacts,pageTarget,pageRevision,pageSummary} from './page-facts';
import {sensitiveKinds} from './classification';
const target=async(a:{id:string},c:Parameters<typeof pageTarget>[0])=>pageTarget(c,a.id);
const revision=async(a:{id:string},c:Parameters<typeof pageTarget>[0])=>pageRevision(c,a.id);
export function curationTools(env:AppBindings) {return [
 job(env,{name:'revisions.restore',title:'Restore the exact permitted historical page revision',clauses:['REV-003'],schema:z.object({id,revisionId:id}),readOnly:false,classes:['standard','external','sensitive'],classify:async(a,c)=>pageFacts(c,a.id,true,await readRevision(c,a.id,a.revisionId)),target,revision,summary:async(a,c)=>({...await pageSummary(c,a.id),items:['Restore revision '+a.revisionId]}),run:(a,c,d)=>restorePageRevision(c,a.id,a.revisionId,{...nativeOperation(d),expectedRevisionId:c.agentRevision!})}),
 job(env,{name:'pages.discard',title:'Discard unpublished changes in favour of the published revision',clauses:['LIFE-007'],schema:z.object({id}),readOnly:false,classes:['standard','external','sensitive'],classify:async(a,c)=>{const p=await readPage(c,a.id);return pageFacts(c,a.id,true,p.publishedRevisionId?await readRevision(c,a.id,p.publishedRevisionId):null);},target,revision,summary:async(a,c)=>({...await pageSummary(c,a.id),items:['Restore published content; discard unpublished changes']}),run:(a,c,d)=>discardChanges(c,a.id,{...nativeOperation(d),expectedRevisionId:c.agentRevision!})}),
 job(env,{name:'queries.run',title:'Run a permission-filtered native content query',clauses:['BLOCK-010'],schema:z.object({id,definition:contentQueryDefinitionSchema}),readOnly:true,classes:['standard','sensitive'],classify:async(a,c)=>{const kinds=sensitiveKinds(await contentQuery(c,a.id,a.definition));return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},target,run:(a,c)=>contentQuery(c,a.id,a.definition)}),
];}
