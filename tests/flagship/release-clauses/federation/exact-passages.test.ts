import {env} from 'cloudflare:test';
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {addSource,refreshSource,resolveEvidence} from '../../../../src/core/features/source-memory/service';
import {disconnect} from '../../../../src/core/features/connectors/service';
import {actors,connectNative,fresh,installation,reset,secret,trap} from './fixture';

beforeEach(reset);
afterEach(()=>vi.unstubAllGlobals());
const hashText=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(text)))),b=>b.toString(16).padStart(2,'0')).join('');

it('SOURCE-002 — an exact passage remains revision-pinned across refresh failure and becomes content-free when its current authority is lost',async()=>{
 const {owner}=await actors(),native=installation('passages'),transport=trap([native]);
 native.text='First chunk. '.repeat(360)+'EXACT OLD QUOTATION. '.repeat(230);
 const originalText=native.text,originalTitle=native.title;
 const connected=await connectNative(owner,native),added=await addSource(fresh(owner),{operationKey:'add-passages',connectionId:connected.value.id,remoteId:native.target});
 const first=await refreshSource(fresh(owner),added.value.id,secret);
 const reference={sourceId:first.sourceId,sourceRevisionId:first.sourceRevisionId,passageId:`${first.sourceRevisionId}:1`};
 const revision=await env.DB.prepare('SELECT * FROM federation_revisions WHERE id=?').bind(first.sourceRevisionId).first<any>();
 expect(revision).toMatchObject({source_id:first.sourceId,remote_revision:'native-r1',title:originalTitle,content_hash:await hashText(originalText),observed_at:'2026-10-05T00:00:00.000Z'});
 expect(revision.published_at).toBeTruthy();
 expect(JSON.parse(revision.acl_json)).toEqual({accountId:native.config.accountId,principalId:native.identity.principalId,installationId:native.identity.installationId,origin:native.origin});
 const initialPassages=(await env.DB.prepare('SELECT * FROM federation_passages WHERE revision_id=? ORDER BY ordinal').bind(first.sourceRevisionId).all<any>()).results;
 expect(initialPassages.length).toBeGreaterThan(2);expect(initialPassages.map(p=>p.content).join('')).toBe(originalText);
 expect(initialPassages[1]).toMatchObject({id:reference.passageId,revision_id:first.sourceRevisionId,ordinal:1,content:originalText.slice(4000,8000)});
 expect(await resolveEvidence(fresh(owner),reference,{secret})).toMatchObject({state:'available',reference,text:originalText.slice(4000,8000),title:originalTitle,freshness:'current'});
 native.revision='native-r2';native.title='Changed title';native.text='SECOND REVISION MUST NOT REPLACE CITATION. '.repeat(240);
 const second=await refreshSource(fresh(owner),added.value.id,secret);
 expect(second.sourceRevisionId).not.toBe(first.sourceRevisionId);
 expect(await resolveEvidence(fresh(owner),reference,{secret})).toMatchObject({state:'available',reference,text:originalText.slice(4000,8000),title:originalTitle,freshness:'stale'});
 expect(await env.DB.prepare('SELECT * FROM federation_revisions WHERE id=?').bind(first.sourceRevisionId).first()).toEqual(revision);
 expect((await env.DB.prepare('SELECT * FROM federation_passages WHERE revision_id=? ORDER BY ordinal').bind(first.sourceRevisionId).all()).results).toEqual(initialPassages);
 const pointerBefore=await env.DB.prepare('SELECT * FROM federation_sources WHERE id=?').bind(first.sourceId).first<any>();
 const revisionsBefore=(await env.DB.prepare('SELECT * FROM federation_revisions ORDER BY id').all()).results;
 const passagesBefore=(await env.DB.prepare('SELECT * FROM federation_passages ORDER BY id').all()).results;
 expect(pointerBefore.published_revision_id).toBe(second.sourceRevisionId);
 native.revision='native-r3';native.text='UNPUBLISHED STAGING TEXT. '.repeat(410);let observedStaging=false;
 native.onCheck=async()=>{
  const staged=await env.DB.prepare("SELECT id,published_at FROM federation_revisions WHERE source_id=? AND remote_revision='native-r3'").bind(first.sourceId).first<any>();
  expect(staged).not.toBeNull();expect(staged.published_at).toBeNull();
  expect(await env.DB.prepare('SELECT count(*) AS n FROM federation_passages WHERE revision_id=?').bind(staged.id).first<number>('n')).toBe(Math.ceil(native.text.length/4000));
  expect(await env.DB.prepare('SELECT published_revision_id FROM federation_sources WHERE id=?').bind(first.sourceId).first<string>('published_revision_id')).toBe(second.sourceRevisionId);
  observedStaging=true;native.revision='native-r4';
 };
 await expect(refreshSource(fresh(owner),first.sourceId,secret)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
 expect(observedStaging).toBe(true);native.onCheck=undefined;
 const revisionsAfterFailure=(await env.DB.prepare('SELECT * FROM federation_revisions ORDER BY id').all()).results;
 const passagesAfterFailure=(await env.DB.prepare('SELECT * FROM federation_passages ORDER BY id').all()).results;
 expect(revisionsAfterFailure).toEqual(revisionsBefore);
 expect(passagesAfterFailure).toEqual(passagesBefore);
 const after=await env.DB.prepare('SELECT * FROM federation_sources WHERE id=?').bind(first.sourceId).first<any>();
 expect(after).toMatchObject({published_revision_id:second.sourceRevisionId,refresh_id:null,revision_id:pointerBefore.revision_id,state:'active'});
 const refreshes=(await env.DB.prepare('SELECT state,error_code FROM federation_refreshes WHERE source_id=? ORDER BY id').bind(first.sourceId).all()).results;
 expect(refreshes).toEqual([{state:'completed',error_code:null},{state:'completed',error_code:null},{state:'failed',error_code:'SOURCE_CHANGED'}]);
 expect(await resolveEvidence(fresh(owner),reference,{secret})).toMatchObject({state:'available',reference,text:originalText.slice(4000,8000),freshness:'stale'});
 native.checkStatus=403;
 expect(await resolveEvidence(fresh(owner),reference,{secret})).toEqual({state:'unavailable',reference,reason:'access'});
 native.checkStatus=200;
 expect(await resolveEvidence(fresh(owner),reference,{secret})).toMatchObject({state:'available',reference,text:originalText.slice(4000,8000)});
 native.checkStatus=404;
 expect(await resolveEvidence(fresh(owner),reference,{secret})).toEqual({state:'unavailable',reference,reason:'deleted'});
 expect(await resolveEvidence(fresh(owner),reference,{secret})).toEqual({state:'unavailable',reference,reason:'deleted'});
 expect(await env.DB.prepare('SELECT count(*) AS n FROM federation_passages').first<number>('n')).toBe(0);
 expect((await env.DB.prepare('SELECT title,acl_json,content_hash FROM federation_revisions WHERE source_id=?').bind(first.sourceId).all()).results).toEqual([{title:'',acl_json:'{}',content_hash:''},{title:'',acl_json:'{}',content_hash:''}]);
 transport.assertClosed();
 console.log('U2 passage effects',JSON.stringify({initialPassages:initialPassages.length,reference,retainedContentHash:revision.content_hash,publishedPointerBeforeFailure:pointerBefore.published_revision_id,publishedPointerAfterFailure:after.published_revision_id,revisionsBeforeFailure:revisionsBefore.length,revisionsAfterFailure:revisionsAfterFailure.length,passagesBeforeFailure:passagesBefore.length,passagesAfterFailure:passagesAfterFailure.length,refreshes,controlledCalls:transport.calls,operationalEffects:0}));
});

it('SOURCE-002 — current connection authority is rechecked after the final provider read and disconnected passages disclose only a tombstone',async()=>{
 const {owner}=await actors(),native=installation('final-authority'),transport=trap([native]);native.publicAudience=true;
 const connected=await connectNative(owner,native),added=await addSource(fresh(owner),{operationKey:'add-authority',connectionId:connected.value.id,remoteId:native.target});
 const first=await refreshSource(fresh(owner),added.value.id,secret);
 const reference={sourceId:first.sourceId,sourceRevisionId:first.sourceRevisionId,passageId:`${first.sourceRevisionId}:0`};
 expect(await resolveEvidence(fresh(owner),reference,{secret,publicAudience:true})).toMatchObject({state:'available',reference,text:native.text,scope:[owner.actor.id,'public']});
 let checks=0;
 native.onCheck=async()=>{
  checks++;
  // The second check is the public-audience check, after the first local authority check.
  if(checks===2)expect(await disconnect(fresh(owner),{id:connected.value.id,operationKey:'disconnect-at-final-read',expectedRevisionId:connected.receipt.revisionId!},secret)).toMatchObject({value:{state:'revoked'},remoteRevocation:'confirmed'});
 };
 expect(await resolveEvidence(fresh(owner),reference,{secret,publicAudience:true})).toEqual({state:'unavailable',reference,reason:'access'});
 expect(checks).toBe(2);
 const callsAfterRevoke=transport.calls.length;
 expect(await resolveEvidence(fresh(owner),reference,{secret})).toEqual({state:'unavailable',reference,reason:'access'});
 expect(transport.calls).toHaveLength(callsAfterRevoke);
 expect(await env.DB.prepare('SELECT state,credential_ciphertext FROM federation_connections WHERE id=?').bind(connected.value.id).first()).toEqual({state:'revoked',credential_ciphertext:null});
 expect(transport.calls.filter(c=>c.path==='revoke')).toHaveLength(1);
 transport.assertClosed();
 console.log('U2 final authority effects',JSON.stringify({controlledCalls:transport.calls,remoteRevocations:1,operationalEffects:0}));
});
