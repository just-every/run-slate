import {env} from 'cloudflare:test';
import {afterEach,test,expect,vi} from 'vitest';
import {fixture,canary} from '../data/fixture';
import {connect} from '../../../src/core/features/connectors/service';
import {addSource,refreshSource,forgetSource} from '../../../src/core/features/source-memory/service';
const secret='01234567890123456789012345678901';
afterEach(()=>vi.unstubAllGlobals());
for(const boundary of ['provider-read','passage-batch'] as const)test(`forget wins refresh at ${boundary} without resurrected canonical bytes`,async()=>{
 const f=await fixture();let armed=false,forgot=false,sourceId='',revisionId='';
 const forget=async()=>{if(forgot)return;forgot=true;await forgetSource({...f.ctx},{id:sourceId,operationKey:'race-forget',expectedRevisionId:revisionId});};
 vi.stubGlobal('fetch',async(url:string)=>{
  if(armed&&boundary==='provider-read'&&!url.endsWith('/user'))await forget();
  return new Response(JSON.stringify(url.endsWith('/user')?{id:7,login:'reader'}:{title:canary,body:canary.repeat(1800),updated_at:'v1',state:'open',number:1}));
 });
 const connection=await connect(f.ctx,{operationKey:'race-connect',provider:'github',accountId:'reader',token:'local-fixture'},secret),source=await addSource(f.ctx,{operationKey:'race-source',connectionId:connection.value.id,remoteId:'acme/project/1'});
 sourceId=source.value.id;revisionId=source.receipt.revisionId!;armed=true;
 const db=new Proxy(env.DB,{get(target,key){if(key==='batch')return async(statements:D1PreparedStatement[])=>{const result=await target.batch(statements);if(boundary==='passage-batch'&&!forgot&&await env.DB.prepare('SELECT count(*) n FROM federation_passages WHERE revision_id IN (SELECT id FROM federation_revisions WHERE source_id=?)').bind(sourceId).first<number>('n'))await forget();return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 await expect(refreshSource({...f.ctx,db},sourceId,secret)).rejects.toBeTruthy();expect(forgot).toBe(true);
 for(const [table,where] of [['federation_sources','id=?'],['federation_revisions','source_id=?'],['federation_passages','revision_id IN (SELECT id FROM federation_revisions WHERE source_id=?)']])expect(JSON.stringify((await env.DB.prepare(`SELECT * FROM ${table} WHERE ${where}`).bind(sourceId).all()).results)).not.toContain(canary);
 expect(await env.DB.prepare('SELECT state,published_revision_id,refresh_id FROM federation_sources WHERE id=?').bind(sourceId).first()).toEqual({state:'deleted',published_revision_id:null,refresh_id:null});
 expect(await env.DB.prepare('SELECT count(*) n FROM federation_passages WHERE revision_id IN (SELECT id FROM federation_revisions WHERE source_id=?)').bind(sourceId).first()).toEqual({n:0});
});

test('failed staging is discarded while the previous published revision remains exact',async()=>{
 const f=await fixture();let version=1,issueReads=0,changeDuringCheck=false;
 vi.stubGlobal('fetch',async(url:string)=>{if(url.endsWith('/user'))return new Response(JSON.stringify({id:7,login:'reader'}));issueReads++;return new Response(JSON.stringify({title:version===1?'Published source':canary,body:version===1?'Retained published bytes':canary,updated_at:changeDuringCheck&&issueReads>1?'raced':`v${version}`,state:'open',number:1}));});
 const connection=await connect(f.ctx,{operationKey:'cleanup-connect',provider:'github',accountId:'reader',token:'local-fixture'},secret),source=await addSource(f.ctx,{operationKey:'cleanup-source',connectionId:connection.value.id,remoteId:'acme/project/2'}),published=await refreshSource(f.ctx,source.value.id,secret);
 version=2;issueReads=0;changeDuringCheck=true;
 await expect(refreshSource(f.ctx,source.value.id,secret)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
 expect(await env.DB.prepare('SELECT published_revision_id,refresh_id FROM federation_sources WHERE id=?').bind(source.value.id).first()).toEqual({published_revision_id:published.sourceRevisionId,refresh_id:null});
 expect((await env.DB.prepare('SELECT title FROM federation_revisions WHERE source_id=?').bind(source.value.id).all()).results).toEqual([{title:'Published source'}]);
 expect((await env.DB.prepare('SELECT content FROM federation_passages WHERE revision_id=?').bind(published.sourceRevisionId).all()).results).toEqual([{content:'State: open\nRetained published bytes'}]);
});
