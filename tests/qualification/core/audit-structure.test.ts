import {test} from 'vitest';
import {auditFixture,createUlid} from './audit-support';
test('ACT-002 BASE-OPS-005 container and database structure mutations retain attributed audit',async()=>{
 const f=await auditFixture();
 const c=await f.mutation('container creation','containers.create','POST','/api/containers',{name:'Audit structure',visibility:'private'});
 await f.mutation('container modification','containers.update','PATCH',`/api/containers/${c.value.id}`,{expectedRevisionId:c.value.revisionId,name:'Audit structure changed'});
 const d=await f.mutation('database creation','databases.create','POST','/api/databases',{containerId:c.value.id,title:'Audit database'});
 const field={id:createUlid(),name:'Audit field',type:'text',config:{},position:0};
 const s=await f.mutation('database field creation','databases.field','POST',`/api/databases/${d.value.id}/fields`,{expectedRevisionId:d.value.revisionId,field});
 const t=await f.mutation('database field modification','databases.field','POST',`/api/databases/${d.value.id}/fields`,{expectedRevisionId:s.value.revisionId,field:{...field,name:'Changed field'}});
 const del=await f.mutation('database field deletion','databases.field','POST',`/api/databases/${d.value.id}/fields`,{expectedRevisionId:t.value.revisionId,field,delete:true});
 await f.mutation('database structure lock','databases.lock','POST',`/api/databases/${d.value.id}/lock`,{expectedRevisionId:del.value.revisionId,locked:true});
});
