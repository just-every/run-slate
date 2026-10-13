import { readFile, writeFile } from 'node:fs/promises';
import { makePart } from '@runeditrun/rer/modules/portability';
import { ArchiveVerifier, ContentVerifier } from '@runeditrun/rer/modules/portability/format';
import { canonicalJson } from '@runeditrun/rer/internal/modules/portability/hash.mjs';

/**
 * Changes the first row of `table` that `edit` returns a replacement for and
 * seals the archive again, as a faulty or hostile exporter would: every part
 * and closing checksum is valid, so only the restore's own checks can refuse it.
 */
export async function resealWithRow(input, output, table, edit) {
  const [manifest, ...rest] = (await readFile(input, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const parts = rest.slice(0, -1);
  let changed = false;
  const content = new ContentVerifier(manifest), archive = new ArchiveVerifier(manifest), sealed = [];
  for (const part of parts) {
    const items = part.items.map(item => {
      if (changed || item.kind !== 'row' || item.table !== table) return item;
      const row = edit(item.row);
      if (!row) return item;
      changed = true;
      return { ...item, row };
    });
    const next = await makePart(part.index, items);
    for (const item of items) content.add(item);
    archive.add(next);
    sealed.push(next);
  }
  if (!changed) throw Error(`No ${table} row was changed`);
  const closing = { kind: 'closing', partCount: sealed.length, contentHash: content.digest(), archiveHash: archive.digest() };
  await writeFile(output, [manifest, ...sealed, closing].map(record => canonicalJson(record)).join('\n') + '\n', { mode: 0o600 });
}

/** Flips one hex digit of the closing content hash: a damaged copy of a real archive. */
export async function corrupt(input, output) {
  const lines = (await readFile(input, 'utf8')).trim().split('\n');
  const closing = JSON.parse(lines.at(-1));
  closing.contentHash = (closing.contentHash[0] === '0' ? '1' : '0') + closing.contentHash.slice(1);
  lines[lines.length - 1] = canonicalJson(closing);
  await writeFile(output, lines.join('\n') + '\n', { mode: 0o600 });
}
