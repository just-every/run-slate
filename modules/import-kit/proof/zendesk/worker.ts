import { applyImportBatches, resumeImport, undoImport, openSqliteImportStorage } from '../../src/index.ts';
import { lilyTargets } from './sqlite.ts';
import { contextFor } from './runtime.ts';
const [file,job,action]=process.argv.slice(2);
const storage=openSqliteImportStorage(file,{targets:lilyTargets});
const context:any=contextFor(storage);context.leaseMs=30000;
try {
  if(action==='kill') {
    context.leaseMs=1000;
    const original=storage.targets;
    storage.targets={...original,write(db,row) {
      const progress=db.prepare('SELECT checkpoint,total FROM ik_jobs WHERE id=?').get(job);
      if(progress.checkpoint>0) { process.stdout.write(JSON.stringify(progress)+'\n');process.kill(process.pid,'SIGKILL'); }
      original.write(db,row);
    }};
    await applyImportBatches(job,context);
    throw new Error('Crash probe did not reach an interrupted publication');
  } else if(action==='undo') { context.batchSize=1000; console.log(JSON.stringify(await undoImport(job,context))); }
  else console.log(JSON.stringify(await resumeImport(job,context)));
} finally {storage.close();}
