import test from 'node:test';
import assert from 'node:assert/strict';
import {compareTreePages} from '../../../src/core/app/ui/treePosition';
test('persisted tree order matches SQL NULL/text/id ordering, including equal keys',()=>{
 const pages=[{id:'z',treePosition:''},{id:'b',treePosition:null},{id:'a',treePosition:''},{id:'x',treePosition:'A'},{id:'y',treePosition:'a'},{id:'a',treePosition:null}];
 assert.deepEqual([...pages].sort(compareTreePages).map(p=>[p.id,p.treePosition]),[['a',null],['b',null],['a',''],['z',''],['x','A'],['y','a']]);
 for(const a of pages){assert.equal(compareTreePages(a,a),0);for(const b of pages)assert.equal(Math.sign(compareTreePages(a,b))===-Math.sign(compareTreePages(b,a)),true);}
});
