#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseContract } from '../src/base/runtime/seed-contract.mjs';

// Update selected legacy rows from the authoritative contract without rewriting
// the retained release-acceptance instructions or another campaign's judgments.
const [mode, ...ids] = process.argv.slice(2);
assert.ok(['write', 'check'].includes(mode) && ids.length, 'Use write or check followed by the touched clause IDs.');
const read = name => fs.readFileSync(name, 'utf8');
const cells = line => line.trim().slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim());
const row = values => `| ${values.join(' | ')} |`;
const contract = read('CONTRACT.md');
const summaryHeader = '| Clauses | Done | Partial | Missing | Total |';
const lines = contract.split('\n');
const summary = lines.indexOf(summaryHeader);
assert.ok(summary >= 0, 'The contract needs its Status summary.');
const withoutSummary = [...lines];
withoutSummary.splice(summary, 5);
const parsed = parseContract(withoutSummary.join('\n'));
const clauses = new Map(parsed.clauses.map(clause => [clause.id, { ...clause }]));
// Read complete evidence cells by ID, retaining journey names and descriptions.
for (const line of lines) {
  const values = line.startsWith('|') ? cells(line) : [];
  const id = /^`([^`]+)`$/.exec(values[0] ?? '')?.[1];
  if (id && clauses.has(id) && values.length === 6) clauses.get(id).evidence = values[4];
}
for (const id of ids) assert.ok(clauses.has(id), `Unknown clause ${id}.`);
const tally = selected => ['done', 'partial', 'missing'].map(status => selected.filter(clause => clause.status === status).length).concat(selected.length);
const summaryRows = [
  ['Published', parsed.clauses.filter(clause => clause.kind === 'published')],
  ['Target and push further', parsed.clauses.filter(clause => clause.kind !== 'published')],
  ['All', parsed.clauses],
].map(([label, selected]) => row([label, ...tally(selected)]));
lines.splice(summary + 2, 3, ...summaryRows);
const generatedContract = lines.join('\n');
parseContract(generatedContract);

const acceptanceLines = read('ACCEPTANCE.md').split('\n');
const acceptanceSummary = acceptanceLines.indexOf(summaryHeader);
assert.ok(acceptanceSummary >= 0, 'ACCEPTANCE.md needs its progress summary.');
acceptanceLines.splice(acceptanceSummary + 2, 3, ...summaryRows);
for (const id of ids) {
  const index = acceptanceLines.findIndex(line => line.startsWith(`| \`${id}\` `));
  assert.ok(index >= 0, `ACCEPTANCE.md needs its ${id} row.`);
  const values = cells(acceptanceLines[index]), clause = clauses.get(id);
  assert.equal(values.length, 4, `Unexpected acceptance row for ${id}.`);
  values[2] = clause.status;
  values[3] = clause.evidence;
  acceptanceLines[index] = row(values);
}

const claimLines = read('docs/CLAIMS.md').split('\n');
for (const id of ids) {
  const clause = clauses.get(id);
  const values = [id, clause.status, clause.evidence, clause.gap || 'None.'];
  const index = claimLines.findIndex(line => line.startsWith(`| ${id} |`));
  if (index >= 0) claimLines[index] = row(values);
  else {
    if (!claimLines.some(line => line === '<!-- contract-docs: selected clause evidence -->')) {
      claimLines.push('', '<!-- contract-docs: selected clause evidence -->',
        '| Clause | Status | Proven behaviour | Remaining gap |', '| --- | --- | --- | --- |');
    }
    claimLines.push(row(values));
  }
}
const outputs = new Map([
  ['CONTRACT.md', generatedContract],
  ['ACCEPTANCE.md', acceptanceLines.join('\n')],
  ['docs/CLAIMS.md', claimLines.join('\n').replace(/\n*$/, '\n')],
]);
for (const clause of parsed.clauses) for (const evidence of clause.evidence) assert.ok(fs.existsSync(evidence), `${clause.id}: missing evidence ${evidence}.`);
for (const [name, expected] of outputs) {
  if (mode === 'write') fs.writeFileSync(name, expected);
  else assert.equal(read(name), expected, `${name} is stale; regenerate the touched clauses.`);
}
console.log(`Contract views ${mode === 'write' ? 'regenerated' : 'current'} for ${ids.join(', ')}.`);
