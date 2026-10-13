import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSource, planImport, canonicalJson, sha256 } from '../../src/index.ts';
import type { ImportContext, TargetEffect, SourceBundle } from '../../src/index.ts';
import { d1ReadBridge, insertRow, rowKey, snapshot, statements } from './sqlite.ts';
export const LILY_COMMIT='d24f3f7b4785863a0438a5fa7fde43d71f772a4b';
export const MAPPING_VERSION=`lily-zendesk/${LILY_COMMIT}/kit-v1`;
/** Reuses only Lily's read-only domain planner. Apply, retention, batches, resume and undo are kit exports. */
export async function prepareZendeskPort(lilyRoot:string, options:any, context:ImportContext) {
  const originalReader=await import(pathToFileURL(resolve(lilyRoot,'scripts/zendesk/read.mjs')).href);
  const originalPlanner=await import(pathToFileURL(resolve(lilyRoot,'scripts/zendesk/plan.mjs')).href);
  const records=await originalReader.readSource(options.files);
  const source:SourceBundle={records:[],artifacts:[],diagnostics:[]};
  for(const file of options.files) {
    const part=await readFileSource({namespace:options.namespace,name:file,bytes:await readFile(file),format:'ndjson',parse:(wrapper:any)=> {
      if(!wrapper || Object.keys(wrapper).length!==1) throw new Error('Invalid Zendesk wrapper');
      const [kind,payload]:any=Object.entries(wrapper)[0];
      return {kind,sourceId:String(payload.id),payload};
    }});
    source.records.push(...part.records);source.artifacts.push(...part.artifacts);source.diagnostics.push(...part.diagnostics);
  }
  const db=context.storage.database;
  const original=await originalPlanner.planImport(d1ReadBridge(db),records,options);
  if(original.alreadyImported) throw new Error('Port preparation requires a fresh installation');
  const baseline=snapshot(db);
  const commands=[{table:'data_import_runs',row:{id:original.id,source_namespace:original.namespace,actor_id:original.actor,source_fingerprint:original.fingerprint,created_at:original.now}},...original.commands,
    ...original.outcomes.map((o:any)=>({table:'data_import_source_records',row:{source_namespace:original.namespace,source_type:o.type,source_id:o.sourceId,lily_id:o.lilyId,source_number:o.sourceNumber??null,lily_number:o.lilyNumber??null,outcome:o.outcome,source_json:JSON.stringify(o.source)}})),
    ...original.attachments.map(({bytes,...row}:any)=>({table:'data_import_attachments',row})),
    {table:'audit_entries',row:{id:original.id,actor_id:original.actor,ticket_id:null,action:'data.zendesk.import',outcome:'imported_with_explicit_source_outcomes',payload_json:JSON.stringify({sourceNamespace:original.namespace,fingerprint:original.fingerprint,sourceRecords:original.outcomes.length}),created_at:original.now}}];
  let expected:any;
  db.exec('SAVEPOINT zendesk_dry_run; PRAGMA defer_foreign_keys=ON');
  try {
    statements(db,original.queuePublications.flatMap((p:any)=>p.before));
    for(const c of commands)insertRow(db,c.table,c.row);
    db.prepare('UPDATE ticket_number_allocator SET next_number=?').run(original.next);
    statements(db,original.queuePublications.flatMap((p:any)=>[...p.after,...p.cleanup]));
    expected=snapshot(db);
  } finally { db.exec('ROLLBACK TO zendesk_dry_run; RELEASE zendesk_dry_run'); }
  for(const table of ['ticket_notification_recipients','mail_work_items','mail_dispatch_attempts','ticket_mail_intents','auth_mail_attempts'])if((expected[table]?.length??0)!==(baseline[table]?.length??0))throw new Error(`Historical import would create operational work: ${table}`);
  if(original.commands.some((c:any)=>c.table==='operators'&&c.row.active!==0))throw new Error('Historical imported identities must remain inactive');
  const bySource=new Map(source.records.map(r=>[`${r.kind}/${r.sourceId}`,[] as TargetEffect[]]));
  const ownerById=new Map(records.map((r:any)=>[originalReader.identity(options.namespace,r.type,r.id),`${r.type}/${r.id}`]));
  for(const r of records.filter((r:any)=>r.type==='ticket')) {
    ownerById.set(originalReader.identity(options.namespace,'cycle',r.id),`ticket/${r.id}`);
    for(const c of r.value.comments??[]) ownerById.set(originalReader.identity(options.namespace,'comment',c.id),`ticket/${r.id}`);
  }
  const tickets=records.filter((r:any)=>r.type==='ticket');
  const firstTicket=tickets.length?`ticket/${tickets[0].id}`:undefined;
  const priority=(r:any)=>({organization:0,user:1,group:2,ticket_field:3,ticket_form:4,ticket:5}[r.kind??r.type]??6);
  const leader=[...records].sort((a,b)=>priority(a)-priority(b))[0];
  const first=`${leader.type}/${leader.id}`;
  const delta=new Map<string,any[]>();
  for(const [table,rows] of Object.entries(expected) as any)delta.set(table,rows.filter((row:any)=> !(baseline[table]??[]).some(before=>canonicalJson(before)===canonicalJson(row))));
  const order=[...new Set([...commands.map(c=>c.table),'ticket_service_queue_facts','ticket_service_queue_revisions','ticket_service_queue_requirements','ticket_number_allocator'])];
  for(const table of delta.keys())if(!order.includes(table)&&delta.get(table)!.length)order.push(table);
  for(const table of order)for(const row of delta.get(table)??[]) {
    let owner=table==='data_import_source_records'?(row.source_type==='comment'?ownerById.get(row.lily_id):`${row.source_type}/${row.source_id}`):undefined;
    owner??=Object.values(row).flatMap(v=>typeof v==='string'&&ownerById.has(v)?[ownerById.get(v)!]:[])[0];
    owner??=table==='pending_reasons'||table==='ticket_tags'||table==='ticket_number_allocator'?firstTicket:first;
    if(!owner||!bySource.has(owner))throw new Error(`No source attribution: ${table}`);
    const generated=!commands.some(c=>c.table===table)&&table!=='ticket_number_allocator';
    const value:any={row,generated};
    if(table==='tickets')value.before=original.queuePublications[tickets.findIndex((r:any)=>originalReader.identity(options.namespace,'ticket',r.id)===row.id)].before;
    if(table==='service_cycle_target_legacy')value.after=original.queuePublications[tickets.findIndex((r:any)=>originalReader.identity(options.namespace,'cycle',r.id)===row.cycle_id)].after.concat(original.queuePublications[tickets.findIndex((r:any)=>originalReader.identity(options.namespace,'cycle',r.id)===row.cycle_id)].cleanup);
    if(value.before)value.before=value.before.map(({sql,values}:any)=>({sql,values}));
    if(value.after)value.after=value.after.map(({sql,values}:any)=>({sql,values}));
    const effect:any={targetKind:table,targetId:rowKey(db,table,row),value};
    if(table==='data_import_attachments') {const a=original.attachments.find((a:any)=>a.id===row.id);effect.attachment={base64:a.bytes.toString('base64'),sha256:a.sha256,mediaType:a.content_type};}
    if(table==='ticket_number_allocator') {
      const before=baseline[table][0];
      // Register an explicit native before-image so kit undo restores the allocator.
      effect.expectedRevision=sha256(canonicalJson(before));
    }
    bySource.get(owner)!.push(effect);
  }
  // Reorder by domain dependencies, rather than export wrapper order (fields precede form usage).
  source.records.sort((a,b)=>priority(a)-priority(b));
  const plan=planImport(source,{version:MAPPING_VERSION,map:r=>({effects:bySource.get(`${r.kind}/${r.sourceId}`)!,unmapped:[...(r.kind==='ticket'&&(r.payload as any).via?.channel!=='email'?[{field:'via.channel',reason:'Original channel retained; Lily maps this intake channel to manual'}]:[]),...original.outcomes.filter((o:any)=>o.type===r.kind&&o.sourceId===r.sourceId&&o.outcome==='preserved_source_only_unsupported_native_mapping').map(()=>({reason:'Retained source only; unchanged Lily planner has no native mapping'}))]})},context);
  return {plan,original,baseline,expected,wrapperInputCount:records.length,sourceOutcomeCount:original.outcomes.length};
}
