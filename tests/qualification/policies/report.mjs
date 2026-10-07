import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const [resultsPath, clauseMapPath, emittedPath, outputPath] = process.argv.slice(2);
if (!outputPath) throw Error('Usage: node report.mjs <vitest JSON> <clause-map JSON> <emitted policies JSON> <output JSON>');
const [results, map, emitted] = await Promise.all([resultsPath, clauseMapPath, emittedPath].map(async file => JSON.parse(await readFile(file, 'utf8'))));
const tests = results.testResults.flatMap(file => file.assertionResults.map(test => ({ file: path.relative(process.cwd(), file.name), title: test.fullName, status: test.status, failures: test.failureMessages, durationMs: test.duration })));
const ids = title => new Set(title.match(/(?:BASE-)?[A-Z]+-\d{3}/g) ?? []);
const clauses = map.clauses.filter(clause => ['WP03', 'WP04'].includes(clause.workPackage) || tests.some(test => ids(test.title).has(clause.id))).map(clause => {
    const receipts = tests.filter(test => ids(test.title).has(clause.id));
    return { id: clause.id, workPackage: clause.workPackage, requirementSha256: clause.requirementSha256, localFacetStatus: !receipts.length ? 'not-exercised-here' : receipts.some(test => test.status !== 'passed') ? 'failing-facet' : 'passing-facets', receipts, emittedReceipts: emitted.receipts.filter(receipt => receipt.clauses.includes(clause.id)), wholeClauseAccepted: false, limits: ['Exact tests assert local facets named in their titles; a mapped passing test is not whole-clause acceptance.', 'Rendered profile controls, timing at capacity, human/provider evidence and parent integration remain separate.'] };
});
await writeFile(outputPath, JSON.stringify({ date: new Date().toISOString(), candidate: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(), runtime: { node: process.version, execution: 'Local Workers D1/R2 and emitted Worker HTTP; labelled test actors; no real provider effects' }, artifact: emitted.artifact, evidence: { workerResults: resultsPath, emitted: emittedPath }, counts: { passed: results.numPassedTests, failed: results.numFailedTests, total: results.numTotalTests, clausesWithFacets: clauses.filter(c => c.receipts.length).length, wp03: clauses.filter(c => c.workPackage === 'WP03').length, wp04: clauses.filter(c => c.workPackage === 'WP04').length, wholeClausesAccepted: 0 }, clauses, limits: emitted.limits }, null, 2));
