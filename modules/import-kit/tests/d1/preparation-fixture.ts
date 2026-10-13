import assert from 'node:assert/strict';
import { sqliteSource } from './sqlite-runtime.ts';
import type { D1Database } from '../../src/d1/index.ts';
export const preparationTables=['ik_d1_staging','ik_d1_staging_pages','ik_d1_staging_chunks','ik_d1_staging_index','ik_d1_staging_originals','ik_d1_preparation_receipts','ik_d1_staging_headers'];
export const publicPreparationTables=['ik_jobs','ik_d1_streams','ik_d1_stream_pages','ik_d1_plan_chunks','ik_d1_plan_index','ik_originals','ik_original_sets','ik_d1_creation_plans','native_records'];
export const normalizedPreparation=(count=203,label='Unicode 漢😀 with controls \n"\\')=>{const source=sqliteSource(count,label);for(const artifact of source.artifacts)artifact.original={status:'unavailable',reason:'not-supplied'};return source;};
export function emptyPreparationTables(native:any,tables=preparationTables){for(const table of tables)assert.equal(native.prepare(`SELECT count(*) n FROM ${table}`).get().n,0,table);}
export function observePreparation(db:D1Database,hook:(queries:string[])=>void|Promise<void>):D1Database{return{prepare:query=>db.prepare(query),async batch(statements:any[]){await hook(statements.map(s=>s.query));return db.batch(statements);}};}
