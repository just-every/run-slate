import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
// Retire the former planning application, preserving current wiki feature names.
export const retiredPaths = [
  'index.html', 'src/core/app/main.tsx', 'src/core/app/router.tsx', 'src/core/app/worker.ts',
  'src/core/platform/db/schema.ts', 'src/core/features/briefs', 'src/core/features/plans',
  'src/core/features/tasks', 'src/core/features/overview', 'src/core/features/planning',
  'src/core/features/templates/repository.ts', 'src/core/features/activity/repository.ts',
  'src/core/features/operator-shell', 'src/workspace-data.js', 'src/main.js',
];
export const retiredExports = [
  ['src/core/features/templates/service.ts', 'createTemplateService'],
  ['src/core/features/activity/service.ts', 'createActivityService'],
];
function mentionsRetiredFactory(source, file, name) {
  // Parse code tokens rather than one export spelling. A factory can be exported
  // through a variable, alias, default declaration or re-export. Comments do not
  // carry runtime symbols and must not produce findings.
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = node => {
    if (ts.isIdentifier(node) && node.text === name) found = true;
    if (ts.isExportSpecifier(node) &&
        [node.name.text, node.propertyName?.text].includes(name)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}
export async function retiredRuntimeFindings(root) {
  const findings = [];
  for (const file of retiredPaths) {
    try { await fs.access(path.join(root,file)); findings.push({file,reason:'Retired planning runtime path'}); }
    catch (error) { if (error.code!=='ENOENT') throw error; }
  }
  for (const [file,name] of retiredExports) {
    let source;
    try { source=await fs.readFile(path.join(root,file),'utf8'); }
    catch (error) { if (error.code==='ENOENT') continue; throw error; }
    if (mentionsRetiredFactory(source, file, name)) findings.push({file,reason:`Retired planning export ${name}`});
  }
  return findings;
}
