import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
const {getPlatformProxy}=require('wrangler');
const {createTestDependencies}=await import(pathToFileURL(path.join(root,'tests/support/test-dependencies.ts')).href);
const {sampleData}=await import(pathToFileURL(path.join(root,'tests/fixtures/sample-data/index.ts')).href);
const proxy=await getPlatformProxy({configPath:'wrangler.toml',persist:{path:path.join(process.env.ORBIT_TEST_STATE!,'v3')},remoteBindings:false});
try{const deps=createTestDependencies(proxy.env.DB);await deps.sampleData.seed();const session=await deps.auth.createSession(sampleData.operators[0].id);await writeFile(process.env.CROSS_SESSION_FILE!,JSON.stringify({token:session.token,operatorId:sampleData.operators[0].id}),{mode:0o600});}finally{await proxy.dispose();}
