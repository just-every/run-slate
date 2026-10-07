import {env} from 'cloudflare:test';
import {seedWorkspace,seedMember,seedContainer,seedContainerGrant,seedPage,seedPageGrant} from '../../e2e/setup/fixtures';
import type {FeatureContext} from '../../../src/core/app/feature-context';
import {movePage,previewMove} from '../../../src/core/features/pages/tree';
import type {MovePlacement} from '../../../src/core/features/pages/tree-order';
export {env,seedMember,seedContainerGrant,seedPage,seedPageGrant,seedContainer,movePage,previewMove};
export async function fixture(positions:(string|null)[]=['a','b','c']) {
 const {workspaceId}=await seedWorkspace();
 const {memberId}=await seedMember(workspaceId,{role:'owner',displayName:'Tree Owner',email:crypto.randomUUID()+'@test.invalid'});
 const {containerId}=await seedContainer(workspaceId,{ownerMemberId:memberId,visibility:'open'});
 await seedContainerGrant(containerId,{principalKind:'member',principalId:memberId,level:'edit'});
 const ctx:FeatureContext={db:env.DB,files:env.FILES,jobs:env.JOBS,actor:{id:memberId,workspaceId,workspaceName:'Tree',email:'tree@test.invalid',displayName:'Tree',initials:'TR',role:'owner'},now:new Date().toISOString()};
 const pages=[];
 for(const position of positions){const page=await seedPage(containerId,{title:'Content '+crypto.randomUUID(),authorMemberId:memberId,treePosition:position??'unused'});if(position===null)await env.DB.prepare('UPDATE pages SET tree_position=NULL WHERE id=?').bind(page.pageId).run();pages.push(page);}
 return {ctx,containerId,workspaceId,memberId,pages};
}
export async function ids(containerId:string,parentId:string|null=null){return (await env.DB.prepare('SELECT id FROM pages WHERE container_id=? AND parent_page_id IS ? AND deleted_at IS NULL ORDER BY tree_position COLLATE BINARY,id COLLATE BINARY').bind(containerId,parentId).all<{id:string}>()).results.map(r=>r.id);}
export async function input(ctx:FeatureContext,id:string,placement:MovePlacement){const preview=await previewMove(ctx,id,placement);const row=await ctx.db.prepare('SELECT revision_id FROM pages WHERE id=?').bind(id).first<{revision_id:string}>();return {...placement,...preview,expectedRevisionId:row!.revision_id,operationKey:crypto.randomUUID()};}
export async function bystanders(pageIds:string[]){const out=[];for(const id of pageIds){const page=await env.DB.prepare('SELECT * FROM pages WHERE id=?').bind(id).first<Record<string,unknown>>();delete page!.tree_position;const revisions=(await env.DB.prepare('SELECT * FROM page_revisions WHERE page_id=? ORDER BY id').bind(id).all()).results;const events=(await env.DB.prepare('SELECT * FROM content_events WHERE page_id=? ORDER BY revision_id,kind').bind(id).all()).results;out.push({page,revisions,events});}return out;}
export async function databaseState(){const tables=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all<{name:string}>()).results;const out:Record<string,unknown>={};for(const {name} of tables)out[name]=(await env.DB.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.map(row=>JSON.stringify(row)).sort();return out;}
export function beforeBatch(ctx:FeatureContext,inject:()=>Promise<void>){let pending=true;return {...ctx,db:new Proxy(ctx.db,{get(target,key){if(key==='batch')return async(statements:D1PreparedStatement[])=>{if(pending){pending=false;await inject();}return target.batch(statements);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}})};}
