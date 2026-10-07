import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {seedWorkspace,seedMember} from '../../e2e/setup/fixtures';
import {decodeArchive,byteHash} from '../../../src/core/features/portability/archive';
import {restoreWorkspace} from '../../../src/core/features/portability/service';
import {runContentJobs} from '../../../src/core/features/lifecycle/jobs';
import {scheduledJobs} from '../../../src/core/app/background';
import type {FeatureContext} from '../../../src/core/app/feature-context';
test('BASE-DATA-002 genuine imported archive retains every canonical row and original blob through maintenance',async()=>{
 const bindings=env as unknown as {DATA_ARCHIVE:Fetcher;DATA_RETENTION_RECEIPT:Fetcher};
 const bytes=new Uint8Array(await(await bindings.DATA_ARCHIVE.fetch('http://archive/')).arrayBuffer()),{manifest}=await decodeArchive(bytes),owner=manifest.tables.members!.find(m=>m.is_setup_owner===1)!;
 const {workspaceId}=await seedWorkspace(),{memberId}=await seedMember(workspaceId,{role:'owner',email:String(owner.email),displayName:'Archive operator',isSetupOwner:true});
 const ctx:FeatureContext={db:env.DB,files:env.FILES,jobs:env.JOBS,actor:{id:memberId,workspaceId,workspaceName:'Retention',email:String(owner.email),displayName:'Archive operator',initials:'AR',role:'owner'},now:new Date().toISOString()};
 expect((await restoreWorkspace(ctx,bytes)).state).toBe('completed');
 const snapshot=async():Promise<Record<string,string[]>>=>Object.fromEntries(await Promise.all(Object.keys(manifest.tables).map(async table=>[table,(await env.DB.prepare(`SELECT * FROM "${table}"`).all()).results.map(row=>JSON.stringify(row)).sort()] as const)));
 const before=await snapshot(),blobKeys=(await env.FILES.list()).objects.map(o=>o.key),blobHashes=await Promise.all(blobKeys.map(async key=>byteHash(new Uint8Array(await(await env.FILES.get(key))!.arrayBuffer()))));
 expect(Object.keys(before)).toHaveLength(106);expect(Object.values(before).filter(rows=>rows.length).length).toBeGreaterThanOrEqual(31);
 await runContentJobs(env,'1999-01-01T00:00:00.000Z');await runContentJobs(env,'2100-01-01T00:00:00.000Z');await scheduledJobs(env);
 const after=await snapshot();
 // Native automation advances its delivery cursor; it does not rewrite retained user records.
 const cursorAfter=after.automation_event_cursors;expect(before.automation_event_cursors).toEqual([]);expect(cursorAfter).toHaveLength(1);expect(JSON.parse(cursorAfter![0]!)).toEqual({workspace_id:manifest.tables.workspaces![0]!.id,sequence:await env.DB.prepare('SELECT MAX(sequence) sequence FROM content_events').first<number>('sequence')});
 expect(Object.fromEntries(Object.entries(after).filter(([table])=>table!=='automation_event_cursors'))).toEqual(Object.fromEntries(Object.entries(before).filter(([table])=>table!=='automation_event_cursors')));

 expect((await env.FILES.list()).objects.map(o=>o.key)).toEqual(blobKeys);
 expect(await Promise.all(blobKeys.map(async key=>byteHash(new Uint8Array(await(await env.FILES.get(key))!.arrayBuffer()))))).toEqual(blobHashes);
 expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
 await bindings.DATA_RETENTION_RECEIPT.fetch('http://receipt/',{method:'POST',body:JSON.stringify({archiveHash:await byteHash(bytes),canonicalTables:Object.keys(before).length,populatedTables:Object.values(before).filter(rows=>rows.length).length,counts:Object.fromEntries(Object.entries(before).map(([table,rows])=>[table,rows.length])),blobCount:blobKeys.length,blobHashes,maintenance:['content:1999','content:2100','all-native-scheduled-domains:current'],allPreexistingCanonicalRowsUnchanged:true,addedMaintenanceCursor:cursorAfter,allOriginalBytesUnchanged:true},null,2)});
});
