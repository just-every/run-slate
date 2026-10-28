import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message) => { throw new Error(message); };
const cells = (line) => line.split(/(?<!\\)\|/);
const value = (cell) => cell.trim();
const clauseId = (cell) => cell.trim().match(/^`?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,3}|[A-Z]+\d+)`?(?:\s|$)/)?.[1];

function table(lines, header, label) {
  const matches = lines.flatMap((line, i) => line.trim() === header ? [i] : []);
  if (matches.length !== 1) fail(`${label}: expected one ${header} table`);
  const start = matches[0] + 2;
  let end = start;
  while (lines[end]?.startsWith('|')) end++;
  return { start, end };
}

function sourceRows(lines) {
  const heading = lines.indexOf('## Status');
  if (heading < 0) fail('CONTRACT.md: missing Status section');
  const section = lines.slice(heading);
  const { start, end } = table(section, '| Clause | Title | Kind | Status | Evidence | Gap |', 'CONTRACT.md');
  const rows = new Map();
  for (const line of section.slice(start, end)) {
    const parts = cells(line);
    const id = clauseId(parts[1] ?? '');
    const [, , title, kind, status, evidence, gap] = parts.map(value);
    if (parts.length !== 8 || !id || rows.has(id)) fail(`Invalid or duplicate Status row: ${line}`);
    if (!['published', 'target', 'push-further'].includes(kind) || !['done', 'partial', 'missing'].includes(status)) {
      fail(`Invalid kind or status for ${id}`);
    }
    rows.set(id, { title, kind, status, evidence, gap });
  }
  if (!rows.size) fail('CONTRACT.md: empty Status table');
  return rows;
}

function summaries(lines, rows, label) {
  const { start, end } = table(lines, '| Clauses | Done | Partial | Missing | Total |', label);
  const groups = new Map([
    ['Published', [...rows.values()].filter((row) => row.kind === 'published')],
    ['Target and push further', [...rows.values()].filter((row) => row.kind !== 'published')],
    ['All', [...rows.values()]],
  ]);
  if (end - start !== groups.size) fail(`${label}: expected three summary rows`);
  for (let i = start; i < end; i++) {
    const name = value(cells(lines[i])[1]);
    const group = groups.get(name);
    if (!group) fail(`${label}: unexpected summary row ${name}`);
    const counts = ['done', 'partial', 'missing'].map((status) => group.filter((row) => row.status === status).length);
    lines[i] = `| ${name} | ${counts.join(' | ')} | ${group.length} |`;
    groups.delete(name);
  }
}

function acceptanceRows(lines, rows, ids) {
  const found = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('|')) continue;
    const parts = cells(lines[i]);
    const id = clauseId(parts[1] ?? '');
    if (!ids.includes(id)) continue;
    if (parts.length !== 6 || found.has(id)) fail(`Invalid or duplicate ACCEPTANCE row: ${id}`);
    const row = rows.get(id);
    parts[3] = ` ${row.status} `;
    parts[4] = ` ${row.evidence} `;
    lines[i] = parts.join('|');
    found.add(id);
  }
  for (const id of ids) if (!found.has(id)) fail(`ACCEPTANCE.md: missing ${id}`);
}

function claimsRows(lines, rows, ids) {
  const { start, end } = table(lines, '| Clause | Status | Proven behaviour | Remaining gap |', 'docs/CLAIMS.md');
  const found = new Set();
  const render = (id, original = ` ${id} `) => {
    const row = rows.get(id);
    return `|${original}| ${row.status} | ${row.evidence} | ${row.gap || 'None.'} |`;
  };
  for (let i = start; i < end; i++) {
    const parts = cells(lines[i]);
    const id = clauseId(parts[1] ?? '');
    if (!ids.includes(id)) continue;
    if (parts.length !== 6 || found.has(id)) fail(`Invalid or duplicate CLAIMS row: ${id}`);
    lines[i] = render(id, parts[1]);
    found.add(id);
  }
  lines.splice(end, 0, ...ids.filter((id) => !found.has(id)).map((id) => render(id)));
}

async function evidencePaths(row, id) {
  for (const [, path] of row.evidence.matchAll(/`([^`]+)`/g)) {
    if (!path.includes('/') && !/\.[a-z0-9]+$/i.test(path)) continue;
    const local = relative(root, resolve(root, path));
    if (isAbsolute(path) || local.startsWith('..') || isAbsolute(local)) fail(`${id}: evidence path is outside repository: ${path}`);
    await access(resolve(root, path)).catch(() => fail(`${id}: missing evidence path ${path}`));
  }
}

async function main() {
  const [mode, ...requested] = process.argv.slice(2);
  if (!['write', 'check'].includes(mode) || !requested.length) fail('Usage: node scripts/contract-docs.mjs <write|check> CLAUSE...');
  const ids = [...new Set(requested)];
  const files = ['CONTRACT.md', 'ACCEPTANCE.md', 'docs/CLAIMS.md'];
  const originals = await Promise.all(files.map((file) => readFile(resolve(root, file), 'utf8')));
  const docs = originals.map((text) => text.split('\n'));
  const rows = sourceRows(docs[0]);
  for (const id of ids) if (!rows.has(id)) fail(`Unknown clause: ${id}`);
  await Promise.all(ids.map((id) => evidencePaths(rows.get(id), id)));
  summaries(docs[0], rows, files[0]);
  summaries(docs[1], rows, files[1]);
  acceptanceRows(docs[1], rows, ids);
  claimsRows(docs[2], rows, ids);
  const results = docs.map((lines) => lines.join('\n'));
  const stale = files.filter((_, i) => results[i] !== originals[i]);
  if (mode === 'check' && stale.length) fail(`Stale contract views: ${stale.join(', ')}. Run node scripts/contract-docs.mjs write ${ids.join(' ')}`);
  if (mode === 'write') {
    for (let i = 0; i < files.length; i++) {
      if (results[i] !== originals[i]) await writeFile(resolve(root, files[i]), results[i]);
    }
  }
  console.log(`Contract views ${mode === 'check' ? 'current' : 'updated'}: ${ids.join(', ')}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
