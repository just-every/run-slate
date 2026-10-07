import { test,expect } from "vitest";
import { env } from "cloudflare:test";
import { setup,databaseWith,field } from "./repair-fixture";
import { validateValue,matches,compare,aggregate } from "../../../src/core/features/databases/values";
import { saveField,createRecord } from "../../../src/core/features/databases/service";
import { openRecord,updateRecord } from "../../../src/core/features/databases/records";
import { saveView,queryView,chart } from "../../../src/core/features/databases/views";
import { validateFormulas } from "../../../src/core/features/databases/formulas";
test("DB-002 computed assignments reject null/empty and imported results survive",async()=>{
 const {ctx,containerId}=await setup();const db=await databaseWith(ctx,containerId,"readonly",[field("formula","formula",{expression:{literal:42}})]);
 const record=await createRecord(ctx,db.id,{operationKey:"readonly-record",title:"Record",values:{}});
 await env.DB.prepare("UPDATE database_fields SET config_json='{}' WHERE id='formula' AND database_id=?").bind(db.id).run();
 await env.DB.prepare("UPDATE database_records SET field_values_json=? WHERE page_id=?").bind(JSON.stringify({formula:42}),record.value.pageId).run();
 for(const value of [null,"",undefined])expect(()=>validateValue(field("formula","formula"),value)).toThrow();
 for(const [index,value] of [null,""].entries())await expect(updateRecord(ctx,record.value.pageId,{operationKey:`readonly-edit-${index}`,expectedRevisionId:record.receipt.revisionId,values:{formula:value}})).rejects.toMatchObject({code:"COMPUTED_FIELD"});
 expect((await openRecord(ctx,record.value.pageId)).values.formula).toBe(42);
});
test("DB-002 dates compare instants consistently in filters and views",async()=>{
 const {ctx,containerId}=await setup();const db=await databaseWith(ctx,containerId,"dates",[field("when","date")]);
 const earlier="2026-09-27T00:30:00+10:00",later="2026-09-26T15:00:00Z";
 const definitions=[field("when","date")];
 expect(matches({when:earlier},{field:"when",op:"lt",value:later},0,definitions)).toBe(true);
 expect(matches({when:earlier},{field:"when",op:"eq",value:"2026-09-26T14:30:00Z"},0,definitions)).toBe(true);
 expect(compare(earlier,later,"date")).toBeLessThan(0);
 await createRecord(ctx,db.id,{operationKey:"dates-early-record",title:"Early",values:{when:earlier}});
 await createRecord(ctx,db.id,{operationKey:"dates-late-record",title:"Late",values:{when:later}});
 await saveView(ctx,db.id,{operationKey:"dates-save-view",expectedRevisionId:db.revisionId,view:{id:"dates-view",name:"Earlier",layout:"table",filters:[{field:"when",op:"lt",value:later}],sorts:[{field:"when",direction:"asc"}],groups:[],calculations:{},display:{},position:0}});
 expect((await queryView(ctx,db.id,"dates-view")).records.map(r=>r.title)).toEqual(["Early"]);
});
test("DB-002 formula output types constrain rollups, charts and later dependency edits",async()=>{
 const {ctx,containerId}=await setup();const db=await databaseWith(ctx,containerId,"types",[field("label","select",{options:["A"]}),field("result","formula",{expression:{literal:3}})]);
 let saved=await saveField(ctx,db.id,{operationKey:"types-relation",expectedRevisionId:db.revisionId,field:field("rel","relation",{databaseId:db.id})});
 saved=await saveField(ctx,db.id,{operationKey:"types-rollup",expectedRevisionId:saved.receipt.revisionId,field:field("total","rollup",{relationField:"rel",targetField:"result",calculation:"sum"})});
 await expect(saveField(ctx,db.id,{operationKey:"types-text-change",expectedRevisionId:saved.receipt.revisionId,field:field("result","formula",{expression:{literal:"text"}})})).rejects.toMatchObject({code:"ROLLUP_TYPE"});
 expect(validateFormulas([field("text","formula",{expression:{literal:"text"}})]).get("text")).toBe("text");
 expect(()=>aggregate(["text"],"sum")).toThrow();
 const text=await databaseWith(ctx,containerId,"text",[field("group","select",{options:["A"]}),field("text","formula",{expression:{literal:"text"}})]);
 await saveView(ctx,text.id,{operationKey:"types-text-view",expectedRevisionId:text.revisionId,view:{id:"text-view",name:"Text",layout:"table",filters:[],sorts:[],groups:[],calculations:{},display:{},position:0}});
 await expect(chart(ctx,text.id,"text-view","group","text","sum")).rejects.toMatchObject({code:"INVALID_CHART"});
});

test("DB-002 a target formula edit cannot invalidate another empty database's numeric rollup",async()=>{
 const {ctx,containerId}=await setup();const source=await databaseWith(ctx,containerId,"cross-type-source",[field("cross-formula","formula",{expression:{literal:5}})]);
 const consumer=await databaseWith(ctx,containerId,"cross-type-consumer",[field("cross-relation","relation",{databaseId:source.id}),field("cross-total","rollup",{relationField:"cross-relation",targetField:"cross-formula",calculation:"sum"})]);
 await expect(saveField(ctx,source.id,{operationKey:"cross-type-change",expectedRevisionId:source.revisionId,field:field("cross-formula","formula",{expression:{literal:"invalid numeric dependency"}})})).rejects.toMatchObject({code:"ROLLUP_TYPE"});
 expect(consumer.id).toBeTruthy();
});
