import {nativeRestoreCheckpoint} from './checkpoint';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {decodeArchive,schema,type WorkspaceArchive} from './archive';
import {portableTables} from './tables';
import {validateBlockContent} from '../editor/validation';
import {emptyBootstrapStatusSelect} from './bootstrap-status';
import {emptyBootstrapJobsSelect} from './bootstrap-jobs';
// Native bootstrap creates identity, policy, an untouched default vocabulary
// and a successful scheduler heartbeat before a newcomer creates content.
// Empty searches can also leave operational statistics before any content exists.
// They are replaced atomically with bootstrap custody on an authorized restore.
// Every authored product row (including customized vocabulary) blocks restore.
const productTables=portableTables.filter(name=>!['workspaces','members','workspace_policies','status_entries','core_job_failures','import_native_epoch','analytics_no_result_searches'].includes(name));
// Keep each statement below D1's expression-depth and compound-select limits.
export const emptyTargetSelects=[emptyBootstrapStatusSelect,emptyBootstrapJobsSelect,...Array.from({length:Math.ceil(productTables.length/24)},(_,i)=>`SELECT ${productTables.slice(i*24,(i+1)*24).map(name=>`NOT EXISTS(SELECT 1 FROM "${name}")`).join(' AND ')} AS empty`)];
// A setup bootstrap's authentication custody, response caches and untouched
// vocabulary: discarded when a restore replaces the workspace. These rows can
// reference the disposable owner/workspace even before product data exists.
export const bootstrapCustodyTables=['saml_requests','saml_assertion_replay','saml_provider_config','analytics_no_result_searches','auth_identity_audit','auth_identity_logout','rer_dependency_pending','rer_dependency_codes','rer_dependency_keys','rer_dependency_link','rer_dependency_installation','mail_deliveries','auth_proofs','auth_limits','member_identity_bindings','sessions','magic_links','invitations','identity_states','rer_mail_development_outbox','operation_receipts','discovery_snapshots','status_entries','core_job_failures','member_authority','members','workspace_policies','workspaces'];
export async function requireEmptyRestoreTarget(ctx:FeatureContext){
 const empty=await ctx.db.batch<{empty:number}>(emptyTargetSelects.map(sql=>ctx.db.prepare(sql)));
 if(empty.some(result=>!result.results[0]?.empty))throw new ApiProblem(409,'RESTORE_NOT_EMPTY','Restore requires a deployment with no containers or product records.');
}
const schemaMismatch=(what:'tables'|'columns')=>new ApiProblem(409,'ARCHIVE_SCHEMA_MISMATCH',`Archive ${what} do not match the installed schema.`);
// An archive from an earlier Slate restores into today's schema when later
// migrations only added to it: every archived table and column still exists,
// tables it lacks stay empty, and columns it lacks take their declared default
// or NULL. A dropped or renamed table or column, a newer archive, or an added
// NOT NULL column without a default under archived rows is refused.
// Returns, per archived table, the installed columns the archive carries.
async function forwardColumns(db:D1Database,columns:Record<string,string[]>,manifest:WorkspaceArchive){
 const names=Object.keys(manifest.tables);
 if(JSON.stringify([...names].sort())!==JSON.stringify(Object.keys(manifest.columns).sort())||names.some(name=>!portableTables.includes(name as never)||!columns[name]))throw schemaMismatch('tables');
 const carried:Record<string,string[]>={};
 for(const name of names){
  const archived=manifest.columns[name]!,installed=columns[name]!;
  if(!Array.isArray(archived)||new Set(archived).size!==archived.length||archived.some(column=>!installed.includes(column)))throw schemaMismatch('columns');
  if(archived.length<installed.length&&manifest.tables[name]!.length){
   const info=(await db.prepare(`PRAGMA table_info("${name}")`).all<{name:string;notnull:number;dflt_value:string|null}>()).results;
   if(info.some(column=>!archived.includes(column.name)&&column.notnull&&column.dflt_value===null))throw schemaMismatch('columns');
  }
  carried[name]=installed.filter(column=>archived.includes(column));
 }
 return carried;
}
export async function prepareRestore(ctx:FeatureContext,bytes:Uint8Array){
 await requireWorkspaceOwner(ctx);
 const owner=await ctx.db.prepare('SELECT email,is_setup_owner FROM members WHERE id=?').bind(ctx.actor.id).first<{email:string;is_setup_owner:number}>();
 if(!owner?.is_setup_owner)throw new ApiProblem(403,'SETUP_OWNER_REQUIRED','Authenticate as the configured setup owner.');
 const {manifest,entries}=await decodeArchive(bytes),columns=await schema(ctx.db);
 const checkpoint=await nativeRestoreCheckpoint(ctx.db,manifest.checkpoint);
 const fence=await ctx.db.prepare(checkpoint.select).bind(...checkpoint.values).first<Record<string,number>>();
 if(!fence||Object.values(fence)[0]!==1)throw new ApiProblem(409,'ERASURE_CHECKPOINT','This archive predates a retained redaction checkpoint.');
 const carried=await forwardColumns(ctx.db,columns,manifest);
 for(const name of Object.keys(manifest.tables)){
  for(const row of manifest.tables[name]!){
   if(Object.keys(row).some(k=>!carried[name]!.includes(k))||Object.values(row).some(v=>v!==null&&typeof v!=='string'&&typeof v!=='number'))throw new ApiProblem(400,'INVALID_ARCHIVE_ROW','Archive record is invalid.');
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
 if(owners[0]!.status==='removed'||owners[0]!.member_kind!=='member')throw new ApiProblem(409,'RESTORE_OWNER_REMOVED','You were removed from, or were a guest in, the archived workspace. Restore as a full member who was not removed.');
 await requireEmptyRestoreTarget(ctx);
 return {owner,manifest,entries,columns,carried,restoredOwner:owners[0]!};
}
