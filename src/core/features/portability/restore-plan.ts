import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {decodeArchive,schema} from './archive';
import {portableTables} from './tables';
import {validateBlockContent} from '../editor/validation';
// Only native bootstrap identity/policy rows may exist before replacing the deployment.
const productTables=portableTables.filter(name=>!['workspaces','members','workspace_policies'].includes(name));
// Keep each statement below D1's expression-depth and compound-select limits.
export const emptyTargetSelects=Array.from({length:Math.ceil(productTables.length/24)},(_,i)=>`SELECT ${productTables.slice(i*24,(i+1)*24).map(name=>`NOT EXISTS(SELECT 1 FROM "${name}")`).join(' AND ')} AS empty`);
export async function requireEmptyRestoreTarget(ctx:FeatureContext){
 const empty=await ctx.db.batch<{empty:number}>(emptyTargetSelects.map(sql=>ctx.db.prepare(sql)));
 if(empty.some(result=>!result.results[0]?.empty))throw new ApiProblem(409,'RESTORE_NOT_EMPTY','Restore requires a deployment with no containers or product records.');
}
export async function prepareRestore(ctx:FeatureContext,bytes:Uint8Array){
 await requireWorkspaceOwner(ctx);
 const owner=await ctx.db.prepare('SELECT email,is_setup_owner FROM members WHERE id=?').bind(ctx.actor.id).first<{email:string;is_setup_owner:number}>();
 if(!owner?.is_setup_owner)throw new ApiProblem(403,'SETUP_OWNER_REQUIRED','Authenticate as the configured setup owner.');
 const {manifest,entries}=await decodeArchive(bytes),columns=await schema(ctx.db);
 if(JSON.stringify(Object.keys(columns).sort())!==JSON.stringify(Object.keys(manifest.tables).sort()))throw new ApiProblem(409,'ARCHIVE_SCHEMA_MISMATCH','Archive tables do not match the installed schema.');
 for(const name of Object.keys(manifest.tables)){
  if(!portableTables.includes(name as never)||JSON.stringify(columns[name])!==JSON.stringify(manifest.columns[name]))throw new ApiProblem(409,'ARCHIVE_SCHEMA_MISMATCH','Archive columns do not match the installed schema.');
  for(const row of manifest.tables[name]!){
   if(Object.keys(row).some(k=>!columns[name]!.includes(k))||Object.values(row).some(v=>v!==null&&typeof v!=='string'&&typeof v!=='number'))throw new ApiProblem(400,'INVALID_ARCHIVE_ROW','Archive record is invalid.');
   try{
    if(name==='page_blocks')validateBlockContent(String(row.block_type),JSON.parse(String(row.content_json)));
    if(name==='page_revisions'){
     const blocks=JSON.parse(String(row.body_json));
     if(!Array.isArray(blocks))throw new Error('Revision body must be blocks.');
     for(const block of blocks)validateBlockContent(block.blockType,block.content);
    }
   }catch{throw new ApiProblem(400,'INVALID_ARCHIVE_ROW','Archive block content is invalid.');}
  }
 }
 const owners=manifest.tables.members?.filter(m=>String(m.email).toLowerCase()===owner.email.toLowerCase());
 if(owners?.length!==1)throw new ApiProblem(409,'RESTORE_OWNER_MISSING','Archive must contain the authenticated setup owner email.');
 await requireEmptyRestoreTarget(ctx);
 return {owner,manifest,entries,columns,restoredOwner:owners[0]!};
}
