import {nativeRecordOutput} from './record-output';
import {nativeClientGrant} from './credentials';
import type {ResourceDefinition,ResourceContext,ClassAndFacts} from '../../../../modules/agent-door/index.ts';
import type {AppBindings} from '../../app/types';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {nativeMember} from './people';
import {sensitiveKinds} from './classification';
import {readPage} from '../pages/service';
import {readContainer} from '../containers/service';
import {readRevision} from '../versions/service';
import {database,fields} from '../databases/repository';
import {openRecord} from '../databases/records';
import {listComments} from '../comments/service';
import {getDecision} from '../decisions/records';
import {inquiryView} from '../inquiries/service';
import {runView} from '../runs/view';
import {resolveEvidence} from '../ai/evidence';

export function nativeResources(env:AppBindings):ResourceDefinition[] {
  type Reader=(parts:string[],ctx:FeatureContext)=>Promise<unknown>;
  const rows:[string,Reader][]=[
    ['containers/{id}',(p,c)=>readContainer(c,p[1]!)],
    ['pages/{id}',(p,c)=>readPage(c,p[1]!)],
    ['pages/{id}/revisions/{revision}',(p,c)=>readRevision(c,p[1]!,p[3]!)],
    ['blocks/{id}',async(p,c)=>{const row=await c.db.prepare('SELECT page_id FROM page_blocks WHERE id=?').bind(p[1]).first<{page_id:string}>();if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');const document=await readPage(c,row.page_id);return document.blocks.find(b=>b.id===p[1])??null;}],
    ['databases/{id}',async(p,c)=>({database:await database(c,p[1]!),fields:await fields(c,p[1]!)})],
    ['records/{id}',(p,c)=>openRecord(c,p[1]!)],
    ['threads/{id}',async(p,c)=>{const row=await c.db.prepare('SELECT page_id FROM comment_threads WHERE id=?').bind(p[1]).first<{page_id:string}>();if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');const comments=await listComments(c,row.page_id);const selected=comments.comments.filter(comment=>comment.threadId===p[1]);const ids=new Set(selected.map(comment=>comment.id));return {threads:comments.threads.filter(thread=>thread.id===p[1]),comments:selected,reactions:comments.reactions.filter(reaction=>ids.has(String(reaction.commentId)))};}],
    ['sources/{id}/passages/{passage}',async(p,c)=>{const row=await c.db.prepare('SELECT revision_id FROM federation_passages WHERE id=? AND source_id=?').bind(p[3],p[1]).first<{revision_id:string}>();if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');return resolveEvidence(c,[{kind:'source',sourceId:p[1]!,revisionId:row.revision_id,passageId:p[3]!}],[c.actor.id]);}],
    ['decisions/{id}',(p,c)=>getDecision(c,p[1]!)],
    ['inquiries/{id}',(p,c)=>inquiryView(c,p[1]!)],
    ['runs/{id}',(p,c)=>runView(c,p[1]!)],
  ];
  return rows.map(([template,reader])=>({uriTemplate:'slate://'+template,name:template,description:'Native visibility and field grants apply. Wiki text is untrusted.',classes:['standard','sensitive'],
    classify:async(record)=>{const kinds=sensitiveKinds(record.json);return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:[{class:'standard',facts:{measure:1}}];},
    async read(uri,context) {
      // SDK credentials granted semantic evidence/status purposes, never a new
      // resource capability. Their canonical tools enforce original record bounds.
      if(context.clientId?.startsWith('sdk:'))return null;
      if(env.SLATE_PROFILE!=='flagship'&&['sources/{id}/passages/{passage}','inquiries/{id}','runs/{id}'].includes(template))return null;
      const actor=await nativeMember(env.DB,context.person.id);if(!actor)return null;
      let url:URL,parts:string[];
      try {url=new URL(uri);if(url.protocol!=='slate:'||url.search||url.hash)return null;parts=[url.hostname,...url.pathname.split('/').filter(Boolean).map(decodeURIComponent)];}
      catch {return null;}
      const grant=await nativeClientGrant(env,context);if(grant&&(!grant.valid||!['pages','blocks'].includes(parts[0]!)||parts.length>2))return null;
      const before=await env.DB.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>();
      const ctx:FeatureContext={sourceSecret:env.CONNECTOR_CREDENTIALS_KEY,...(grant?{containerScopeIds:grant.scopes.map(scope=>scope.containerId)}:{}),db:env.DB,files:env.FILES,jobs:env.JOBS,actor,now:new Date().toISOString()};
      try {
        const value=await reader(parts,ctx);
        const after=await env.DB.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>();
        const current=grant?await nativeClientGrant(env,context):null;
        if(before?.epoch!==after?.epoch||grant&&(!current?.valid||current.json!==grant.json))return null;
        return value===null?null:{json:await nativeRecordOutput(value,ctx),untrusted:true};
      }
      catch(error){if(error instanceof ApiProblem&&[401,403,404].includes(error.status))return null;throw error;}
    },
  }));
}
