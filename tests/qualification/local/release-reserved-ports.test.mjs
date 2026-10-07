import test from 'node:test';
import assert from 'node:assert/strict';
import {qualificationPorts} from './ports.mjs';

test('Release caller reserved range validates explicit app and inspector allocations',()=>{
 assert.deepEqual(qualificationPorts(56200,56201,'56200-56219'),{minimum:56200,maximum:56219,appPort:56200,inspectorPort:56201});
 assert.equal(qualificationPorts(8700,8799,'8700-8799').maximum,8799);
 for(const range of ['','56200','56219-56200','0-65535','1024-65536','56200-56200',' 56200-56219','56200-56219junk'])assert.throws(()=>qualificationPorts(56200,56201,range));
 for(const pair of [[56200,56200],[56199,56201],[56200,56220],[56200.5,56201],[NaN,56201],[56200,Infinity]])assert.throws(()=>qualificationPorts(...pair,'56200-56219'));
});
