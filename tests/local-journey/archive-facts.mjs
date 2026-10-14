import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { readArchive } from '@runeditrun/rer/modules/portability';

/** Compare every retained fact and byte independently of schema and part hashes. */
export async function archiveFacts(path) {
  let manifest;
  const rows = {}, binaries = new Map();
  for await (const record of readArchive(Readable.toWeb(createReadStream(path)))) {
    if (record.kind === 'manifest') {
      manifest = record;
      for (const table of manifest.tables) rows[table.name] = [];
    }
    for (const item of record.items ?? []) {
      if (item.kind === 'row') rows[item.table].push(item);
      else {
        const key = JSON.stringify([item.kind, item.bucket, item.key, item.name]);
        const chunks = binaries.get(key) ?? [];
        chunks.push(Buffer.from(item.data, 'base64'));
        binaries.set(key, chunks);
      }
    }
  }
  return { manifest, rows, binaries: Object.fromEntries([...binaries].map(([key, chunks]) => [key, Buffer.concat(chunks)])) };
}

export function equalArchiveFacts(before, after, additions = {}) {
  assert.deepEqual(Object.keys(after.rows), Object.keys(before.rows), 'every retained table survives');
  for (const [table, items] of Object.entries(before.rows)) {
    const defaults = additions[table] ?? {};
    const projected = after.rows[table].map(item => {
      const row = { ...item.row };
      for (const [column, value] of Object.entries(defaults)) {
        assert.equal(row[column], value, `${table}.${column}: the new schema supplies its default`);
        delete row[column];
      }
      return { ...item, row };
    });
    assert.deepEqual(projected, items, `${table}: all old columns, row identifiers and ordering survive`);
  }
  assert.deepEqual(after.manifest.objects, before.manifest.objects, 'every object and its metadata survives');
  assert.deepEqual(after.manifest.payloads, before.manifest.payloads, 'every payload survives');
  assert.deepEqual(after.binaries, before.binaries, 'all object and payload bytes survive');
}
