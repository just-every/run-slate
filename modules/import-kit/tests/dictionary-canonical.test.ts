import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaryEncode, dictionaryDecode } from '../src/d1/plan-dictionary.ts';
import { canonicalJson } from '../src/provenance/identity.ts';
import type { Json } from '../src/types.ts';

const oracle=(value: any):string=>Array.isArray(value)?'['+value.map(oracle).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+oracle(value[key])).join(',')+'}':JSON.stringify(value);

test('native dictionary serialization has the exact independent canonical bytes for every encoded node type', () => {
  const prototypeKeys=JSON.parse('{"10":1,"2":"two","__proto__":{"constructor":false}}');
  const nullPrototype=Object.assign(Object.create(null),{z:[null,-0,false,true,0,'0'],a:prototypeKeys});
  const values: Json[]=[null,false,true,0,-0,1.25,'','\u0000\b\f\n\r\t"\\','漢😀e\u0301\ud800',[],{},prototypeKeys,nullPrototype,
    {text:'{"numeric":0,"boolean":false,"text":"0","nested":[null,"漢"]}',literal:' { "not": "normalized" } ',long:'漢😀'.repeat(50000)},
    Array.from({length:5000},(_,index)=>({[String(index)]:['key-'+index,index,Boolean(index%2)]}))];
  for(const value of values){
    const packed=dictionaryEncode(value);
    assert.equal(JSON.stringify(packed),oracle(packed));
    assert.equal(canonicalJson(dictionaryDecode(packed)),oracle(value));
  }
});
