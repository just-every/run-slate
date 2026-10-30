import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '../../src/d1/types.ts';

/** Inspect persisted SQL values, decoded originals/chunks, and all SQLite sidecars. */
export async function forbiddenOccurrences(native: DatabaseSync, db: D1Database, marker: string) {
  const count = (value: Uint8Array | string) => Buffer.from(value).toString().split(marker).length - 1;
  let tables = 0, chunks = 0, files = 0;
  function inspect(value: unknown): number {
    if (typeof value === 'string') {
      let n = count(value);
      // All byte custody uses base64, sometimes nested inside plan JSON.
      if (/^[A-Za-z0-9+/=]+$/.test(value)) n += count(Buffer.from(value, 'base64'));
      try { const json = JSON.parse(value); if (json && typeof json === 'object') n += inspect(json); } catch {}
      return n;
    }
    if (Array.isArray(value)) return value.reduce((n, item) => n + inspect(item), 0);
    if (value && typeof value === 'object') return Object.values(value).reduce<number>((n, item) => n + inspect(item), 0);
    return 0;
  }
  const names = native.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[];
  for (const {name} of names) {
    const rows = native.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all();
    tables += inspect(rows);
  }
  const rows = await db.prepare('SELECT base64 FROM ik_door_chunks').all<{base64:string}>();
  for (const row of rows.results) chunks += count(Buffer.from(row.base64,'base64'));
  const location = native.prepare('PRAGMA database_list').get() as {file:string};
  for (const file of await readdir(dirname(location.file))) files += count(await readFile(join(dirname(location.file),file)));
  return {chunks,tables,files};
}
export async function storedBytes(db: D1Database, uploadId: string) {
  const result = await db.prepare('SELECT base64 FROM ik_door_chunks WHERE upload_id=? ORDER BY ordinal').bind(uploadId).all<{base64:string}>();
  return Buffer.concat(result.results.map(row=>Buffer.from(row.base64,'base64')));
}
export function assertZero(counts: {chunks:number;tables:number;files:number}) {assert.deepEqual(counts,{chunks:0,tables:0,files:0});}
