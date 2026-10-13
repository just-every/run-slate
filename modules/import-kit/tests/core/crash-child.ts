import { writeSync } from 'node:fs';
import { mock } from 'node:test';
import { context, source, mapping } from './fixtures.ts';
import { sqliteTargets } from '../../src/storage/sqlite.ts';
import { planImport } from '../../src/plan/index.ts';
import { createImportJob, applyImportBatches, undoImport, resumeImport } from '../../src/engine/index.ts';
const [path,mode,id,now]=process.argv.slice(2);
// Share the parent's lease clock across fresh processes, independent of CI speed.
mock.timers.enable({apis:['Date'],now:Number(now)});
const stop=()=>{writeSync(1,'KILL_NOW\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);throw new Error('parent failed to kill');};
const targets={...sqliteTargets,write(db,row){sqliteTargets.write(db,row);if(mode==='apply'&&row.targetId==='1')stop();},remove(db,destination,kind,key){sqliteTargets.remove(db,destination,kind,key);if(mode==='undo'&&key==='2')stop();}};
const ctx=context(path,targets);ctx.leaseMs=500;
try {
  if(mode==='apply') {const plan=planImport(source(),mapping,ctx);ctx.reviewedFingerprint=plan.fingerprint;const job=await createImportJob(plan,ctx);writeSync(1,'JOB '+job.id+'\n');await applyImportBatches(job,ctx);}
  else if(mode==='resume') writeSync(1,JSON.stringify(await resumeImport(id,ctx))+'\n');
  else await undoImport(id,ctx);
} finally {ctx.storage.close();}
