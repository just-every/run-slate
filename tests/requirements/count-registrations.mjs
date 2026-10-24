import ts from 'typescript';
import {execFileSync} from 'node:child_process';

const ref = process.argv[2] ?? 'HEAD';
const git = (...args) => execFileSync('git', args, {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
const files = git('ls-tree', '-r', '--name-only', ref, 'tests').trim().split('\n').filter(file => /\.[cm]?[jt]sx?$/.test(file) && file !== 'tests/e2e/contract.ts' && !file.endsWith('/journey-shard.mjs'));
const unresolved = [];
const perFile = [];
for (const file of files) {
  const source = ts.createSourceFile(file, git('show', `${ref}:${file}`), ts.ScriptTarget.Latest, true);
  const declarations = new Map();
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const entries = declarations.get(node.name.text) ?? [];
      entries.push(node);
      declarations.set(node.name.text, entries);
    }
    ts.forEachChild(node, collect);
  }
  collect(source);
  function arrayLength(node, seen = new Set()) {
    if (!node) return undefined;
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return arrayLength(node.expression, seen);
    if (ts.isArrayLiteralExpression(node)) return node.elements.length;
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      const next = new Set(seen).add(node.text);
      const candidates = declarations.get(node.text) ?? [];
      const declaration = candidates.filter(item => item.pos <= node.pos).at(-1);
      return arrayLength(declaration?.initializer, next);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'entries') return arrayLength(node.expression.expression, seen);
    if (file === 'tests/release/fixture-policy.test.mjs' && node.getText(source) === 'policy.archives') return JSON.parse(git('show', `${ref}:tests/release/fixture-policy.json`)).archives.length;
    return undefined;
  }
  let total = 0;
  let sites = 0;
  const registrations = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      let count;
      if (/^(test|it|contract|journeyTest|t\.test)(\.(todo|skip|only|profile))?$/.test(callee)) count = 1;
      else if (ts.isCallExpression(node.expression) && /^(test|it)\.each$/.test(node.expression.expression.getText(source))) count = arrayLength(node.expression.arguments[0]);
      if (count !== undefined) {
        sites++;
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (ts.isForOfStatement(parent)) {
            const length = arrayLength(parent.expression);
            if (length === undefined) unresolved.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${parent.expression.getText(source)}`);
            else count *= length;
          }
        }
        total += count;
        registrations.push({line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, name: node.arguments[0]?.getText(source), count});
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (sites) perFile.push({file, total, sites, registrations});
}
console.log(JSON.stringify({ref, total: perFile.reduce((n, file) => n + file.total, 0), sites: perFile.reduce((n, file) => n + file.sites, 0), unresolved, perFile}, null, 2));
if (unresolved.length) process.exitCode = 1;
