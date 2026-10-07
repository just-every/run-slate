import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {command} from '../local/process.mjs';
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export async function frozen(root){const files=(await command('git',['ls-files','-z'],{cwd:root})).split('\0').filter(p=>p&&(p.startsWith('migrations/')||p.startsWith('tests/')||p.startsWith('src/core/features/')&&p.includes('/ui/')||p==='LICENSE'));const output={};for(const file of files)output[file]=digest(await readFile(path.join(root,file),'utf8'));return output;}
export const custodyTables=['workspaces','members','containers','container_owners','container_grants','pages','page_blocks','page_revisions','page_labels','page_grants','comment_threads','comments','knowledge_decisions','decision_citations','decision_reviews','intelligence_skills','intelligence_skill_versions','intelligence_runs','intelligence_revisions','intelligence_model_policy','intelligence_inquiries','intelligence_hypotheses','intelligence_experiments','d1_migrations'];
export async function snapshot(r,columns){
 const names=columns??Object.fromEntries((await r.sql(custodyTables.map(t=>`PRAGMA table_info(${t});`).join('\n'))).map((x,i)=>[custodyTables[i],x.results.map(c=>c.name)]));
 const result=await r.sql(Object.entries(names).map(([table,cols])=>`SELECT ${cols.map(c=>'"'+c+'"').join(',')} FROM ${table} ORDER BY 1;`).join('\n'));
 const tables=Object.fromEntries(Object.keys(names).map((t,i)=>[t,result[i].results]));return {columns:names,tables,hashes:Object.fromEntries(Object.entries(tables).map(([t,v])=>[t,digest(v)]))};
}
export function retained(before,after){for(const [table,rows]of Object.entries(before.tables)){const actual=new Map(after.tables[table].map(row=>[JSON.stringify(Object.values(row)[0]),row]));for(const row of rows)assert.deepEqual(actual.get(JSON.stringify(Object.values(row)[0])),row,`Preserve exact ${table} record ${Object.values(row)[0]}`);}}
