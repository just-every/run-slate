import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {withoutRenderedDocs} from './build/docs-boundary.mjs';

// Inspect emitted bytes only. Runtime access journeys run in Slate's Verify CI.
const root = process.cwd();
const client = path.join(root, 'dist/client');
const server = path.join(root, 'dist/server');
const failures = [];
const check = (passed, message) => { if (!passed) failures.push(message); };

async function files(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  return (await Promise.all(entries.map(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  }))).flat();
}

await stat(path.join(server, 'index.js'));
const [clientFiles, serverFiles, manifestText] = await Promise.all([
  files(client), files(server), readFile(path.join(root, 'docs/site.json'), 'utf8'),
]);
const scripts = await Promise.all([...clientFiles, ...serverFiles]
  .filter(file => /\.(m?js|cjs)$/.test(file))
  .map(async file => ({file, text: await readFile(file, 'utf8')})));
const clientScripts = scripts.filter(({file}) => file.startsWith(client + path.sep));
check(clientScripts.length > 0, 'The build emitted no client JavaScript.');
check(!clientFiles.some(file => file.endsWith('.html')), 'The build must not prerender HTML.');

const sources = JSON.parse(manifestText).sections.flatMap(section => section.pages.map(page => page.source));
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const docsChunks = new Set();
for (const source of sources) {
  const pattern = new RegExp(`slug:[^,]*,source:[\x60"']${escape(source)}[\x60"'],title:`);
  const chunks = clientScripts.filter(({text}) => pattern.test(text));
  check(chunks.length === 1, `Expected one rendered docs chunk for ${source}.`);
  for (const {file} of chunks) docsChunks.add(file);
}
for (const {file, text} of clientScripts) {
  const relative = path.relative(root, file);
  for (const symbol of ['cloudflare:workers', 'drizzle-orm', 'sqliteTable', 'token_digest', 'tokenDigest']) {
    check(!text.includes(symbol), `${relative} contains server-only symbol ${symbol}.`);
  }
  if (docsChunks.has(file)) {
    check(!/(?:SESSION_SECRET|MAIL_API_KEY)/.test(withoutRenderedDocs(text)), `${relative} names a server binding.`);
  } else {
    for (const symbol of ['SESSION_SECRET', 'MAIL_API_KEY']) {
      check(!text.includes(symbol), `${relative} contains server-only symbol ${symbol}.`);
    }
  }
}
const libraries = /registerLanguage|micromark|mdast-util|remark-parse|remark-gfm|react-markdown|\bunified\(|hast-util|highlight\.js/;
for (const {file, text} of scripts) {
  check(!libraries.test(text), `${path.relative(root, file)} contains a Markdown build library.`);
}
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log('Emitted artifact boundaries are valid. Runtime acceptance runs in Slate Verify CI.');
}
