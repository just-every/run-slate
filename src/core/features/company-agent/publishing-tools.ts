import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import type {FeatureContext} from '../../app/feature-context';
import type {ClassAndFacts} from '../../../../modules/agent-door/index.ts';
import {ApiProblem} from '../../app/problems';
import {requirePageLevel} from '../sharing/current-access';
import {publicationSchema} from '../lifecycle/publication-input';
import {previewPublication} from '../lifecycle/publication-preview';
import {publishPage} from '../lifecycle/publication';
import {publishingExposure} from '../publishing/exposure';
import {publishPublicPage} from '../publishing/service';
import {runtimeConfigFor} from '../../app/runtime-gate';
import {readPage} from '../pages/service';
import {pageFacts,pageTarget,pageRevision,pageSummary} from './page-facts';
import {job,id,nativeOperation,standard} from './tool';
import {sensitiveKinds} from './classification';
const release=publicationSchema.omit({operationKey:true,expectedRevisionId:true,previewFingerprint:true,publishAt:true}).extend({id});
const exposure=z.object({id,slug:z.string().min(1).max(200),indexable:z.boolean().optional(),theme:z.string().max(200).optional(),headerControls:z.array(z.string()).optional(),duplicateAsTemplate:z.boolean().optional(),socialPreview:z.record(z.string(),z.string()).optional(),children:z.array(z.object({pageId:id,slug:z.string().min(1).max(200),expectedRevisionId:id})).max(100).optional()});
const target=(a:{id:string},c:FeatureContext)=>pageTarget(c,a.id);
const revision=(a:{id:string},c:FeatureContext)=>pageRevision(c,a.id);
const rank:Record<string,number>={view:1,comment:2,edit:3,full:4};
async function publication(a:z.infer<typeof release>,c:FeatureContext) {
 const {id,...input}=a;
 const preview=await previewPublication(c,id,{...input,expectedRevisionId:await pageRevision(c,id)});
 const changes=preview.audience.flatMap(page=>page.readers.filter(reader=>reader.before!==reader.after));
 return {preview,changes};
}
async function exposureFacts(c:FeatureContext,a:z.infer<typeof exposure>):Promise<ClassAndFacts[]> {
 const pages=[a.id,...(a.children??[]).map(child=>child.pageId)],sensitive:string[]=[],kinds=new Set<string>();let widened=0;
 for(const pageId of pages) {
  await requirePageLevel(c,pageId,'full');const document=await readPage(c,pageId),prior=(await publishingExposure(c,pageId)).exposure;
  if(!prior||prior.revokedAt)widened++;
  const data=sensitiveKinds([document,pageId===a.id?a.socialPreview:null]);if(data.length)sensitive.push(pageId);for(const kind of data)kinds.add(kind);
  const child=a.children?.find(child=>child.pageId===pageId);if(child&&child.expectedRevisionId!==document.page.revisionId)throw new ApiProblem(409,'REVISION_CONFLICT','The child page changed.');
 }
 return [{class:'external',facts:{measure:pages.length,counterparty:'public'}},...(widened?[{class:'access' as const,facts:{measure:widened,direction:'widens' as const}}]:[]),...(sensitive.length?[{class:'sensitive' as const,facts:{measure:sensitive.length,kind:[...kinds].sort().join(', ')}}]:[])];
}
export function publishingTools(env:AppBindings) {return [
 job(env,{name:'pages.publish',title:'Publish a native page with its reviewed destination and audience',clauses:['LIFE-003'],schema:release,readOnly:false,classes:['standard','external','access','sensitive'],classify:async(a,c)=>{
  const {preview,changes}=await publication(a,c);let facts=await pageFacts(c,a.id,true,preview.content,true);
  if(changes.length)facts=[...facts.filter(f=>f.class!=='standard'),{class:'access',facts:{measure:new Set(changes.map(change=>change.memberId)).size,direction:changes.some(change=>(rank[change.after??'']??0)>(rank[change.before??'']??0))?'widens':'narrows'}}];
  return facts;
 },authority:async(a,c)=>{const {changes}=await publication(a,c),own=changes.filter(change=>change.memberId===c.actor.id);return {subject:c.actor.id,widens:own.some(change=>(rank[change.after??'']??0)>(rank[change.before??'']??0))};},target,revision,summary:async(a,c)=>{const {preview,changes}=await publication(a,c);return {...await pageSummary(c,a.id),recipients:[...new Set(changes.filter(change=>change.after).map(change=>change.name))],items:['Publish page',preview.destination.containerName,...preview.descendants.map(page=>page.title),...(a.label?[a.label]:[])]};},run:async(a,c,d)=>{const {id,...input}=a;const preview=await previewPublication(c,id,{...input,expectedRevisionId:c.agentRevision!});return publishPage(c,id,{...input,...nativeOperation(d),expectedRevisionId:c.agentRevision!,previewFingerprint:preview.previewFingerprint});}}),
 job(env,{name:'publishing.read',title:'Read the current public address and its standing public grant',clauses:['WEB-001','WEB-002','WEB-004','WEB-006'],schema:z.object({id}),readOnly:true,classes:['standard','sensitive'],classify:async(a,c)=>{const kinds=sensitiveKinds(await publishingExposure(c,a.id));return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},target,run:async(a,c)=>{const result=await publishingExposure(c,a.id);const grant=await c.db.prepare('SELECT id FROM public_exposures WHERE page_id=? AND revoked_at IS NULL').bind(a.id).first<{id:string}>();return {...result,grants:grant?[grant.id]:[]};}}),
 job(env,{name:'publishing.publish',title:'Publish a page at the installation’s configured public host',clauses:['WEB-001','WEB-002','WEB-004','WEB-005'],schema:exposure,readOnly:false,classes:['external','access','sensitive'],classify:(a,c)=>exposureFacts(c,a),authority:async(a,c)=>{await requirePageLevel(c,a.id,'full');for(const child of a.children??[])await requirePageLevel(c,child.pageId,'full');return {subject:c.actor.id,widens:false};},target,revision,summary:async(a,c)=>({...await pageSummary(c,a.id),recipients:['Public'],items:[a.slug,...(a.children??[]).map(child=>child.slug),...(a.indexable?['Allow search indexing']:[])]}),run:(a,c,d)=>{const config=runtimeConfigFor(env,new URL(d.origin).hostname);return publishPublicPage(c,a.id,{...a,...nativeOperation(d),host:config.publicPageHost??new URL(d.origin).host,expectedRevisionId:c.agentRevision!});}}),
 job(env,{name:'publishing.revoke',title:'Revoke a native public page address',clauses:['WEB-006'],schema:z.object({id}),readOnly:false,classes:['access','sensitive'],narrowing:{effect:'revoke',target:'id'},authority:async(a,c)=>{await requirePageLevel(c,a.id,'full');return {subject:c.actor.id,widens:false};},classify:async(a,c)=>{const prior=(await publishingExposure(c,a.id)).exposure,kinds=sensitiveKinds(await readPage(c,a.id));return [{class:'access',facts:{measure:prior&&!prior.revokedAt?1:0,direction:'narrows'}},...(kinds.length?[{class:'sensitive' as const,facts:{measure:1,kind:kinds.join(', ')}}]:[])];},target,revision,summary:async(a,c)=>({...await pageSummary(c,a.id),items:['Revoke the standing public address']}),run:async(a,c,d)=>{const prior=(await publishingExposure(c,a.id)).exposure;if(!prior)throw new ApiProblem(404,'NOT_FOUND','Not found.');return publishPublicPage(c,a.id,{...nativeOperation(d),expectedRevisionId:c.agentRevision!,host:prior.host,slug:prior.slug,revoke:true});}}),
];}
