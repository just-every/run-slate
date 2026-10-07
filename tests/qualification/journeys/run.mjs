import {mkdir,writeFile} from 'node:fs/promises';
import {command,safeEnvironment} from '../local/process.mjs';
const evidence=process.env.QUAL_EVIDENCE;
if(!evidence)throw Error('QUAL_EVIDENCE required');
await mkdir(evidence,{recursive:true});
const args=process.argv.slice(2);
if(args.length!==1||!['learning','guided','branches','positive','classifications','build','install'].includes(args[0]))throw Error('Use learning, guided, branches, positive, classifications, build or install');
// Install/build use the owner's installed pnpm on PATH (package.json pins its version).
// Select the pinned pnpm before invoking this runner; no private runtime path is assumed.
const executable=['install','build'].includes(args[0])?'pnpm':process.execPath;
const invocation=args[0]==='install'?['install','--offline','--frozen-lockfile']:args[0]==='build'?['exec','vite','build']:['node_modules/vitest/vitest.mjs','run','--config','tests/qualification/journeys/vitest.config.ts',...(args[0]==='classifications'?['tests/qualification/inquiry/trial-loop.test.ts']:args[0]==='positive'?['tests/qualification/journeys/learning-composition.test.ts','tests/qualification/journeys/independent-branches.test.ts']:args[0]==='branches'?['tests/qualification/journeys/independent-branches.test.ts']:args[0]==='guided'?['tests/qualification/journeys/native-guided.test.ts']:['tests/qualification/journeys/learning-composition.test.ts']),'--reporter=json','--outputFile='+evidence+'/'+args[0]+'.json'];
try{await command(executable,invocation,{cwd:process.cwd(),env:{...safeEnvironment(),PATH:process.execPath.slice(0,process.execPath.lastIndexOf('/'))+':'+process.env.PATH},timeout:180000,log:evidence+'/'+args[0]+'.log'});}catch(error){await writeFile(evidence+'/'+args[0]+'-failure.txt',error.stack);throw error;}
