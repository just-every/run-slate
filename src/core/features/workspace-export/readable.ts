import {requireGovernance} from '../workspace/governance';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {currentSubject,requireContainerLevel,requirePageLevel} from '../sharing/current-access';
import {createUlid} from '../../shared/ulid';
import {readableArchive} from './readable-archive';
import {renderDocx} from './docx';
export interface ReadableExportInput {scope:'page'|'descendants'|'container'|'workspace';id:string;format:'markdown'|'html'|'pdf'|'docx';includeComments?:boolean}
/** Restart the access fence for every export, and release no bytes across an ACL change. */
export async function exportReadable(ctx:FeatureContext,input:ReadableExportInput,origin?:string){
 ctx={...ctx,authorizationEpoch:undefined};
 await requireGovernance(ctx,'export');
 if(input.format==='docx'&&!['page','descendants'].includes(input.scope))throw new ApiProblem(400,'WORD_SCOPE','Word exports a page or a page with its descendants.');
 if(input.scope==='workspace')await currentSubject(ctx);else if(input.scope==='container')await requireContainerLevel(ctx,input.id,'view');else await requirePageLevel(ctx,input.id,'view');const ids=input.scope==='workspace'?(await ctx.db.prepare('SELECT id FROM pages WHERE workspace_id=? AND deleted_at IS NULL').bind(ctx.actor.workspaceId).all<{id:string}>()).results.map(r=>r.id):input.scope==='page'?[input.id]:input.scope==='container'?(await ctx.db.prepare('SELECT id FROM pages WHERE container_id=? AND workspace_id=? AND deleted_at IS NULL').bind(input.id,ctx.actor.workspaceId).all<{id:string}>()).results.map(r=>r.id):(await ctx.db.prepare('WITH RECURSIVE tree(id) AS (SELECT id FROM pages WHERE id=? UNION ALL SELECT p.id FROM pages p JOIN tree t ON p.parent_page_id=t.id WHERE p.deleted_at IS NULL) SELECT id FROM tree LIMIT 10001').bind(input.id).all<{id:string}>()).results.map(r=>r.id);if(ids.length>10000)throw new ApiProblem(413,'EXPORT_LIMIT','Export at most 10000 pages at a time.');const allowed=new Set<string>();for(const id of ids){try{await requirePageLevel(ctx,id,'view');allowed.add(id);}catch(error){if(!(error instanceof ApiProblem)||error.status!==404)throw error;}}

 if(input.format==='docx'&&!origin)throw new ApiProblem(503,'EXPORT_ORIGIN_REQUIRED','Word export requires the Slate origin.');
 const result=input.format==='docx'?{bytes:await renderDocx(ctx,allowed,new Set(ids.filter(id=>!allowed.has(id))),origin!,input.includeComments!==false),contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',filename:`slate-${input.scope}-${createUlid()}.docx`,report:[]}:await readableArchive(ctx,input,allowed);
 if((await ctx.db.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>())?.epoch!==ctx.authorizationEpoch)throw new ApiProblem(403,'EXPORT_ACCESS_CHANGED','Access changed while exporting. Try again.');
 return result;
}
