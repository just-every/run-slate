import assert from 'node:assert/strict';
import test from 'node:test';
import {request,ApiError,TransportError} from '../../../src/core/client/transport';
import {validatePageRead} from '../../../src/core/client/pageReadBoundary';

test('SAVE-004: transport boundary distinguishes interrupted HTTP errors, JSON, cancellation and programmer errors',async()=>{
 const original=globalThis.fetch;
 try {
  for(const status of [401,403,404,500,503]) {
   globalThis.fetch=async()=>new Response(new ReadableStream({start(controller){controller.error(new TypeError('interrupted stream'));}}),{status});
   await assert.rejects(request('/api/pages/p'),error=>error instanceof ApiError&&error.status===status);
  }
  globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(request('/api/pages/p'),TransportError);
  globalThis.fetch=async()=>new Response(new ReadableStream({start(controller){controller.error(new TypeError('stream disconnected'));}}),{status:200});
  await assert.rejects(request('/api/pages/p'),TransportError);
  globalThis.fetch=async()=>new Response('{invalid',{status:200});
  await assert.rejects(request('/api/pages/p'),error=>error instanceof ApiError&&error.code==='invalid_response');
  globalThis.fetch=async()=>{throw new Error('programmer failure');};
  await assert.rejects(request('/api/pages/p'),error=>!(error instanceof TransportError));
  const controller=new AbortController();controller.abort();
  globalThis.fetch=async()=>{throw new DOMException('cancelled','AbortError');};
  await assert.rejects(request('/api/pages/p',{signal:controller.signal}),error=>error instanceof DOMException&&error.name==='AbortError');
  globalThis.fetch=async()=>new Response('{}');
  await assert.rejects(request('/api/pages/p',{signal:controller.signal}),error=>error instanceof DOMException&&error.name==='AbortError');
 } finally {globalThis.fetch=original;}
});
test('SAVE-004 SHARE-001: empty, unavailable and wrong-resource successful payloads cannot authorize a page',()=>{
 for(const value of [undefined,null,{}, {available:false}, {connection:{available:false}}, {page:{id:'other'}}]) {
  assert.throws(()=>validatePageRead(value as never,'page'),ApiError);
 }
});
