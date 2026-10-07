import test from 'node:test';
import assert from 'node:assert/strict';
import {readDraft,storeDraft} from '../../../src/core/client/draftRecovery';
import type {EditorBlock} from '../../../src/core/features/editor/ui/types';
test('recovery retains original idempotent payload and newer unsaved text separately, then clears confirmed drafts',()=>{
 const values=new Map<string,string>();
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
 const original={id:'block',type:'paragraph',text:[{text:'Dispatched text'}]} as unknown as EditorBlock;
 const latest={...original,text:[{text:'More text typed while offline'}]} as unknown as EditorBlock;
 const pending=new Map([['block',{block:original,key:'original-operation',revision:'observed-revision'}]]);
 storeDraft('member:page',pending,[latest]);
 assert.deepEqual(readDraft('member:page')?.edits,[...pending]);
 assert.deepEqual(readDraft('member:page')?.blocks,[latest]);
 assert.equal(readDraft('other-member:page'),null);
 storeDraft('member:page',new Map(),[latest]);
 assert.equal(readDraft('member:page'),null);
 delete (globalThis as {sessionStorage?:unknown}).sessionStorage;
});
