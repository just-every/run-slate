import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? sourceFiles(path.join(directory, entry.name))
    : [path.join(directory, entry.name)]))).flat();
}

/** Parse syntax rather than strings in comments; follow runtime edges only. */
export function importSpecifiers(source, filename) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const imports = new Set();
  function visit(node) {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (!clause || clause.name || !bindings || ts.isNamespaceImport(bindings)
        || bindings.elements.length === 0 || bindings.elements.some(element => !element.isTypeOnly)) imports.add(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly
      && (!node.exportClause || ts.isNamespaceExport(node.exportClause)
        || node.exportClause.elements.length === 0 || node.exportClause.elements.some(element => !element.isTypeOnly))) {
      imports.add(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly
      && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) {
      imports.add(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) {
      imports.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return [...imports];
}

export async function inspectUiReachability(root) {
  root = path.resolve(root);
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error('A tsconfig.json is required for module resolution.');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  const all = await sourceFiles(path.join(root, 'src'));
  const roots = all.filter(file => file.startsWith(path.join(root, 'src/routes') + path.sep)
    && /\.[cm]?[jt]sx?$/.test(file));
  roots.push(path.join(root, 'src/server.ts'), path.join(root, 'src/core/app/ext-client.tsx'));
  // vite.config.ts leaves TanStack Start's client.entry at its default: optional src/client.
  // This browser entry is selected by the plugin, so no server-side import points to it.
  const client = ts.resolveModuleName('./client', path.join(root, 'src/server.ts'), parsed.options, ts.sys).resolvedModule;
  if (client) roots.push(client.resolvedFileName);
  // The run site's entry (commandAdapter site.entry, built by `rer build --site`) renders the landing.
  const site = path.join(root, 'src/site/pages.tsx');
  if (all.includes(site)) roots.push(site);
  // Byte-exact Base copies (base-copies.json) are Base's modules, not this seed's UI; Base's own suite covers them.
  const copied = path.join(root, 'src/base') + path.sep;
  const visited = new Set();
  const cache = ts.createModuleResolutionCache(root, file => file, parsed.options);
  const unresolved = [];
  async function visit(file) {
    file = path.resolve(file);
    if (visited.has(file)) return;
    visited.add(file);
    const source = await readFile(file, 'utf8');
    for (const specifier of importSpecifiers(source, file)) {
      // TanStack Start's server entry imports the plugin-resolved virtual router entry.
      // Its documented default is src/router; this edge exists only for that runtime import.
      if (specifier === '@tanstack/react-start/server-entry') {
        const router = ts.resolveModuleName('./router', path.join(root, 'src/server.ts'), parsed.options, ts.sys, cache).resolvedModule;
        if (!router) unresolved.push({ file: path.relative(root, file), specifier: '#tanstack-router-entry' });
        else await visit(router.resolvedFileName);
      }
      const resolved = ts.resolveModuleName(specifier, file, parsed.options, ts.sys, cache).resolvedModule;
      if (!resolved) {
        const extension = path.extname(specifier.split('?')[0]);
        if (specifier.startsWith('.') && (!extension || /\.[cm]?[jt]sx?$/.test(extension))) unresolved.push({ file: path.relative(root, file), specifier });
        continue;
      }
      if (!resolved.isExternalLibraryImport && resolved.resolvedFileName.startsWith(path.join(root, 'src') + path.sep)
        && /\.[cm]?[jt]sx?$/.test(resolved.resolvedFileName) && !resolved.resolvedFileName.endsWith('.d.ts')) await visit(resolved.resolvedFileName);
    }
  }
  for (const file of roots) await visit(file);
  return {
    roots: roots.map(file => path.relative(root, file)),
    reached: [...visited].map(file => path.relative(root, file)).sort(),
    unreachable: all.filter(file => file.endsWith('.tsx') && !file.startsWith(copied) && !visited.has(file)).map(file => path.relative(root, file)).sort(),
    unresolved,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectUiReachability(process.cwd());
  if (result.unreachable.length || result.unresolved.length) {
    console.error(JSON.stringify({ unreachable: result.unreachable, unresolved: result.unresolved }, null, 2));
    process.exitCode = 1;
  } else console.log(`All ${result.reached.filter(file => file.endsWith('.tsx')).length} TSX modules are reachable from the application entries.`);
}
