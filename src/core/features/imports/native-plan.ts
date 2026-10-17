import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {compactSqlValues,type StoredSqlValues} from './compact-sql-values';
import {compactNativeValues} from './compact-native-values';
import type {NativeRowTemplate} from './native-row-values';
import {nativeRowCollections} from './native-row-collections';

export type NativeValue = string | number | null;
export interface NativeRow {table:string; values:Record<string,NativeValue>;derived?:boolean;before?:CapturedSql[];after?:CapturedSql[]}
export interface NativeScope {table:string; column:string; id:string; columns:string[]}
export interface NativeUnit {kind:string; id:string; rows:NativeRow[]; scopes:NativeScope[]; requires:string[]}
interface Column {name:string; dflt_value:string|null; pk:number; type:string}
export interface CapturedSql {sql:string; params:NativeValue[]}

/** The native planners remain the only authors of target statements. Reads are
 * memoized only within this immutable planning invocation; mutations never run. */
export function capturePlanningContext(ctx:FeatureContext) {
  const reads = new Map<string,Promise<unknown>>();
  const values=compactSqlValues();
  class PlanningStatement {
    readonly page:StoredSqlValues['page'];
    readonly index:number;
    constructor(readonly sql:string,retained:StoredSqlValues){this.page=retained.page;this.index=retained.index;}
    get params(){return values.read(this);}
    // Captured INSERTs never need a real D1 statement or expanded bindings.
    // Only an actual planner read constructs the native statement.
    private native(){return ctx.db.prepare(this.sql).bind(...this.params);}
    bind(...values:NativeValue[]) { return wrap(this.sql,values); }
    first(column?:string) { const key=JSON.stringify([this.sql,this.params,'first',column]);if(!reads.has(key))reads.set(key,column?this.native().first(column):this.native().first());return reads.get(key); }
    all() { const key=JSON.stringify([this.sql,this.params,'all']);if(!reads.has(key))reads.set(key,this.native().all());return reads.get(key); }
    run() { throw new Error('Import planning cannot execute target writes.'); }
    raw() { throw new Error('Unregistered import planner read.'); }
  }
  // A large native plan has hundreds of thousands of statements. Shared
  // methods retain each statement's data once, without per-statement closures.
  const wrap=(sql:string,params:NativeValue[]=[]):D1PreparedStatement=>new PlanningStatement(sql,values.add(params)) as unknown as D1PreparedStatement;
  const db = {...ctx.db,prepare:wrap,batch:async()=>{throw new Error('Import planning cannot execute target batches.');}} as unknown as D1Database;
  return {ctx:{...ctx,db}, statement:(statement:D1PreparedStatement)=>{
    if(!(statement instanceof PlanningStatement))throw new Error('Uncaptured native import statement.');values.flush();return statement as CapturedSql;
  }};
}

function literal(input:string):NativeValue {
  const value=input.trim();
  if (/^null$/i.test(value))return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value))return Number(value);
  if (/^'(?:[^']|'')*'$/.test(value))return value.slice(1,-1).replaceAll("''", "'");
  if (/^"[^"]*"$/.test(value))return value.slice(1,-1);
  throw new Error(`Unsupported native planner literal: ${value}`);
}
const tokens=(sql:string)=>sql.match(/'(?:[^']|'')*'|"[^"]*"|[^,]+/g)!.map(v=>v.trim());
const relatedTables = ['page_blocks','page_revisions','page_labels','page_grants','page_contributors','database_records','task_origins'];
const taskOriginInsert='INSERT OR IGNORE INTO task_origins(block_id,page_id,member_id,created_at) VALUES(?,?,?,?)';
const taskReminderCancellation="UPDATE reminders SET cancelled_at=COALESCE(cancelled_at,?) WHERE page_id=? AND block_id=? AND kind='task-due' AND delivered_at IS NULL";

/** Convert the finite INSERT vocabulary emitted by the genuine native planners
 * into complete row snapshots, including schema defaults. Unknown SQL is refused. */
export async function compileNativePlan(ctx:FeatureContext, statements:CapturedSql[],consume=false):Promise<NativeUnit[]> {
  const schemas=new Map<string,Column[]>();
  const scopeColumns=new Map<string,string[]>();
  const schema=async(table:string)=>{if(!schemas.has(table))schemas.set(table,(await ctx.db.prepare(`PRAGMA table_info(${table})`).all<Column>()).results);return schemas.get(table)!;};
  const metadata:CapturedSql[]=[];
  const templates=new Map<string,{table:string;template:NativeRowTemplate;parameters:number}>();
  const rowStore=nativeRowCollections(templates),rows=rowStore.collection();
  const mappingStatements:CapturedSql[]=[];
  const mappingGuards=new Map<CapturedSql,CapturedSql[]>();
  const plannedPages=new Map<string,NativeRow>();
  const taskOrigins=new Map<string,CapturedSql>();
  let pendingGuards:CapturedSql[]=[];
  for(let index=0;index<statements.length;index++) {
    const statement=statements[index]!;if(consume)delete statements[index];
    if(statement.sql.startsWith('INSERT INTO core_write_guards')){pendingGuards.push({sql:statement.sql,params:compactNativeValues(statement.params,true)});continue;}
    if(statement.sql.startsWith('UPDATE pages SET access_inheritance=')){metadata.push(statement);continue;}
    if(statement.sql===taskReminderCancellation){
      const origin=taskOrigins.get(String(statement.params[2]));
      if(!origin||statement.params.length!==3||origin.params[1]!==statement.params[1]||pendingGuards.length)throw new Error('Native task reminder cancellation lacks its origin.');
      // Keep task side effects in the same atomic page effect, even when the
      // cancellation is the last native write and has no following INSERT.
      rowStore.appendAfter(origin,{sql:statement.sql,params:compactNativeValues(statement.params,true)});continue;
    }
    const insert=(statement.sql===taskOriginInsert?statement.sql.replace('INSERT OR IGNORE INTO','INSERT INTO'):statement.sql).match(/^INSERT INTO (\w+)\s*(?:\(([^)]+)\))?\s*VALUES\s*\((.*)\)$/s);
    if(!insert)throw new Error(`Unregistered native import statement: ${statement.sql.slice(0,80)}`);
    const table=insert[1]!, columns=await schema(table);
    let compiled=templates.get(statement.sql);
    if(!compiled){
    const names=insert[2]?insert[2].split(',').map(s=>s.trim()):columns.map(c=>c.name);
    let parameter=0;
    const base=Object.fromEntries(columns.filter(c=>!(table==='content_events'&&c.name==='sequence')).map(c=>[c.name,c.dflt_value===null?null:literal(c.dflt_value)])),bindings=new Map<string,number>();
    const expressions=tokens(insert[3]!);
    if(expressions.length!==names.length)throw new Error('Native import column/value mismatch.');
    expressions.forEach((expression,index)=>{const name=names[index]!;if(expression==='?'){if(!Object.hasOwn(base,name))base[name]=null;bindings.set(name,parameter++);}else base[name]=literal(expression);});
    compiled={table,template:{base,bindings},parameters:parameter};templates.set(statement.sql,compiled);
    }
    if(compiled.parameters!==statement.params.length)throw new Error('Native import unused bindings.');
    if(table==='federation_import_mappings'){if(pendingGuards.length)mappingGuards.set(statement,pendingGuards);pendingGuards=[];mappingStatements.push(statement);continue;}
    const row=rowStore.row(statement,pendingGuards);rows.push(row);if(table==='pages')plannedPages.set(String(row.values.id),row);pendingGuards=[];
    if(table==='task_origins')taskOrigins.set(String(row.values.block_id),statement);
  }
  for(const {params:p} of metadata) {
    const page=plannedPages.get(String(p[9]));
    if(!page)throw new Error('Imported metadata has no planned page.');
    const v=page.values;
    if(p[0]!==null)v.access_inheritance=p[0]!;if(p[1]!==null)v.lifecycle=p[1]!;
    if(p[2]==='archived')v.archived_at=p[3]!;
    if(p[4]!==null)v.created_at=p[4]!;if(p[5]!==null)v.updated_at=p[5]!;
    if(p[6])v.published_revision_id=p[7]!;if(p[8]!==null)v.working_revision_id=p[8]!;
  }
  // Native publication triggers create this immutable visibility ledger.
  for(const page of rows.filter(row=>row.table==='pages'))if(page.values.published_revision_id&&['live','live-with-unpublished-changes','archived'].includes(String(page.values.lifecycle)))rows.push({table:'content_published_revisions',values:{page_id:page.values.id!,revision_id:page.values.published_revision_id},derived:true});
  const databasePages=new Map(rows.filter(r=>r.table==='databases').map(r=>[String(r.values.id),String(r.values.page_id)]));
  const units=new Map<string,NativeUnit>(), owners=new Map<string,string>();
  const unit=(kind:string,id:string)=>{const key=`${kind}:${id}`;if(!units.has(key))units.set(key,{kind,id,rows:rowStore.collection(),scopes:[],requires:[]});return units.get(key)!;};
  for(const row of rows) {
    const v=row.values;let kind:string,id:string;
    if(row.table==='pages'){kind='page';id=String(v.id);}
    else if(row.table==='files'){kind='media';id=String(v.id);}
    else if(row.table==='containers'||row.table.startsWith('container_')){kind='container';id=String(v.container_id??v.id);}
    else if(row.table==='members'||row.table==='groups'){kind=row.table==='members'?'member':'group';id=String(v.id);}
    else if(row.table==='record_revisions'||row.table==='structured_revisions'){
      kind=v.entity_kind==='container'?'container':'page';id=String(databasePages.get(String(v.entity_id))??v.entity_id);
    }else {kind='page';id=String(v.page_id??databasePages.get(String(v.database_id)));}
    if(!id||id==='undefined')throw new Error(`Native import row lacks an owner: ${row.table}`);
    const owner=unit(kind,id);owner.rows.push(row);
    if(v.id)owners.set(String(v.id),`${kind}:${id}`);
  }
  for(let index=0;index<mappingStatements.length;index++){
    const statement=mappingStatements[index]!,row=rowStore.row(statement,mappingGuards.get(statement)),owner=owners.get(String(row.values.target_id));
    if(owner)units.get(owner)!.rows.push(row);mappingGuards.delete(statement);delete mappingStatements[index];
  }
  for(const u of units.values()) {
    const root=u.rows.find(r=>r.table===(u.kind==='page'?'pages':u.kind==='container'?'containers':u.kind==='member'?'members':u.kind==='media'?'files':'groups'));
    if(!root)throw new Error(`Native unit lacks its root: ${u.kind}`);
    if(u.kind==='page') {
      u.requires.push(`container:${root.values.container_id}`);
      for(const revision of u.rows.filter(row=>row.table==='page_revisions')) {
        const author=(JSON.parse(String(revision.values.properties_json)) as {post?:{authorMemberId?:string|null}}).post?.authorMemberId;
        if(author&&!u.requires.includes(`member:${author}`))u.requires.push(`member:${author}`);
      }
      if(root.values.parent_page_id)u.requires.push(`page:${root.values.parent_page_id}`);
      if(root.values.database_id)u.requires.push(`page:${databasePages.get(String(root.values.database_id))}`);
    }
    if(u.kind==='media')u.requires.push(`page:${root.values.page_id}`);
    const scopes=new Map<string,{table:string;column:string;id:string}>();
    const add=(table:string,column:string,id:string)=>scopes.set(`${table}:${column}:${id}`,{table,column,id});
    for(const row of u.rows) {
      const v=row.values, table=row.table;
      if(table==='pages'||table==='containers'||table==='members'||table==='groups'||table==='files')add(table,'id',u.id);
      else if((table==='record_revisions'||table==='structured_revisions'))add(table,'entity_id',String(v.entity_id));
      else if(table==='federation_import_mappings')add(table,'id',String(v.id));
      else if(v.page_id)add(table,'page_id',String(v.page_id));
      else if(v.container_id)add(table,'container_id',String(v.container_id));
      else if(v.database_id)add(table,'database_id',String(v.database_id));
      else throw new Error(`Native scope missing: ${table}`);
    }
    if(u.kind==='page')for(const table of relatedTables)add(table,'page_id',u.id);
    if(u.kind==='container')for(const table of ['container_owners','container_members','container_grants'])add(table,'container_id',u.id);
    for(const scope of scopes.values()) {
      if(!scopeColumns.has(scope.table))scopeColumns.set(scope.table,(await schema(scope.table)).map(c=>c.name).filter(c=>!(scope.table==='content_events'&&c==='sequence')));
      const columns=scopeColumns.get(scope.table)!;
      u.scopes.push({...scope,columns});
    }
  }
  // Parents and database definitions precede their children. External
  // destination parents are authorized separately and are never created here.
  const ordered:NativeUnit[]=[];
  while(units.size) {
    let moved=false;
    for(const [key,u] of units)if(!u.requires.some(id=>units.has(id))){ordered.push(u);units.delete(key);moved=true;}
    if(!moved)throw new ApiProblem(400,'IMPORT_TREE_CYCLE','Archive page tree is cyclic.');
  }
  return ordered;
}

/** Exact projections are derived from the retained rows instead of duplicating
 * every body and revision string in each Kit source record and effect. */
export function expectedNativeScope(unit:NativeUnit,scope:NativeScope):string {
  const rows=unit.rows.filter(row=>row.table===scope.table&&row.values[scope.column]===scope.id).map(row=>JSON.stringify(Object.fromEntries(scope.columns.map(column=>[column,row.values[column]??null])))).sort();
  return `[${rows.join(',')}]`;
}
