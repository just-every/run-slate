import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {safeEnvironment} from './process.mjs';

const modulePath=new URL('../../flagship/cross/runtime.mjs',import.meta.url).href;
async function probe(env){
 return promisify(execFile)(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(modulePath)}); console.log(JSON.stringify({origins:m.origins,restoreOrigin:m.restoreOrigin,orbitRoot:m.orbitRoot,environment:m.environment}));`],{env:{...safeEnvironment(),...env}});
}
test('Release original cross supports explicit reserved ports, source root and credential isolation',async()=>{
 const orbitRoot=process.cwd();
 const {stdout}=await probe({CROSS_PORT_BASE:'56200',CROSS_PORT_RANGE:'56200-56219',ORBIT_RUNTIME_ROOT:orbitRoot,SLATE_PROFILE:'flagship',OPENAI_API_KEY:'test-only-unwanted-env',CLOUDFLARE_API_TOKEN:'test-only-unwanted-env'});
 const result=JSON.parse(stdout);
 assert.deepEqual(result.origins,{happytohelp:'http://127.0.0.1:56200',orbit:'http://127.0.0.1:56202',slate:'http://127.0.0.1:56204'});
 assert.equal(result.restoreOrigin,'http://127.0.0.1:56206');
 assert.equal(result.orbitRoot,orbitRoot);
 assert.equal(result.environment.SLATE_PROFILE,'flagship');
 assert.equal(result.environment.OPENAI_API_KEY,undefined);
 assert.equal(result.environment.CLOUDFLARE_API_TOKEN,undefined);
 assert.equal(result.environment.NODE_OPTIONS,process.env.NODE_OPTIONS);
 for(const env of [{CROSS_PORT_BASE:'56200',CROSS_PORT_RANGE:'56200-56205'},{CROSS_PORT_BASE:'not-a-port'},{SLATE_PROFILE:'invalid'}])await assert.rejects(probe(env));
});
