import {readFile, writeFile} from 'node:fs/promises';
import {withSlateExport} from './delivery/slate-spec.mjs';
import {produceSeedArtifact} from './delivery/base/package.mjs';
const config = JSON.parse(await readFile(new URL('./delivery/base/packaging.json', import.meta.url)));
const file = await produceSeedArtifact({config});
const artifact = JSON.parse(await readFile(file, 'utf8'));
artifact.deploymentSpec = withSlateExport(artifact.deploymentSpec);
await writeFile(file, JSON.stringify(artifact) + '\n');
console.log(file);
