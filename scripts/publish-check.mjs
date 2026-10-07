import {readFile, access} from 'node:fs/promises';

// Source/package admission only. verify and operations checks precede this in
// the package command; provider, upgrade and release receipts remain separate.
const failures=[];
const [pkg,seed,release]=await Promise.all(['package.json','seed.json','RELEASE.json'].map(async file=>JSON.parse(await readFile(file,'utf8'))));
if(pkg.version!==release.version || pkg.version!==seed.version) failures.push('Package, seed and release versions differ.');
if(seed.launchProfile?.default!=='core-wiki' || release.launchProfile?.default!=='core-wiki') failures.push('Core-wiki default is missing from release or seed metadata.');
if(!release.contractChanges?.['FLAG-001']?.now?.includes('core-wiki launch amendment')) failures.push('FLAG-001 launch amendment is missing.');
for(const file of ['LICENSE','AGENTS.consumer.md','edition.json','sources.lock.json','rer-project.json','OPERATIONS.json','deploy/footprint.md']) {
  try {await access(file);} catch {failures.push(`Missing release input: ${file}`);}
}
for(const file of ['edition.json','sources.lock.json','rer-project.json','OPERATIONS.json']) {
  try {JSON.parse(await readFile(file,'utf8'));} catch(error) {if(error.code!=='ENOENT') failures.push(`Invalid JSON: ${file}`);}
}
console.log(JSON.stringify({check:'source-publication-inputs',passed:failures.length===0,failures,limits:'Does not certify live providers, sealed prior-store upgrade, qualification suites, a tag, public visibility or deployment.'},null,2));
if(failures.length) process.exitCode=1;
