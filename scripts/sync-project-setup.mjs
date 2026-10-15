import {readFile, writeFile} from 'node:fs/promises';
import {loadSetupManifest} from './delivery/base/setup-manifest.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--check', '--write'].includes(mode)) throw Error('Use --check or --write');

const config = JSON.parse(await readFile(new URL('./delivery/base/packaging.json', import.meta.url)));
const setup = await loadSetupManifest(process.cwd(), config.setup);
if (!setup) throw Error('Packaging must select a setup manifest');

const file = 'rer-project.json';
const current = await readFile(file, 'utf8');
const project = JSON.parse(current);
project.setup = {path: setup.path, sha256: setup.sha256};
const expected = `${JSON.stringify(project, null, 2)}\n`;
if (mode === '--write') await writeFile(file, expected);
else if (current !== expected) throw Error('Stale project setup reference; run node scripts/sync-project-setup.mjs --write');
console.log('Project setup reference matches the generated manifest identity.');
