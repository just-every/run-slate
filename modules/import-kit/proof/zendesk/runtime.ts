import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openSqliteImportStorage } from '../../src/index.ts';
import { lilyTargets } from './sqlite.ts';
import { MAPPING_VERSION } from './port.ts';
export async function createTarget(filename:string,lilyRoot:string) {
  const storage=openSqliteImportStorage(filename,{targets:lilyTargets});
  for(const name of (await readdir(resolve(lilyRoot,'migrations/core'))).filter(n=>n.endsWith('.sql')).sort())storage.database.exec(await readFile(resolve(lilyRoot,'migrations/core',name),'utf8'));
  storage.database.exec("UPDATE ticket_service_queue_enforcement SET enabled=1 WHERE id=1; INSERT INTO operators(id,display_name,email,role,active,created_at,updated_at) VALUES ('admin','Administrator','admin@example.test','owner',1,'2026-01-01','2026-01-01')");
  return storage;
}
export function contextFor(storage:any) {
  return {storage,destination:'lily-local',namespace:'original-zendesk',mappingVersion:MAPPING_VERSION,batchSize:1,leaseMs:30000,authorization:{principalId:'admin',assertAuthorized:(_action:any,_destination:any,db:any)=>{
    const actor=db.prepare("SELECT id FROM operators WHERE id='admin' AND role='owner' AND active=1").get();
    if(!actor)throw new Error('Active Administrator required');
  }}};
}
