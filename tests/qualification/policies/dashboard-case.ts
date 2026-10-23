import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import {sessionFor} from '../../e2e/setup/fixtures';
import type {FeatureContext} from '../../../src/core/app/feature-context';

/** Runs through authenticated HTTP, alongside the existing reader-scoped view case. */
export async function dashboardCase(owner: FeatureContext, reader: FeatureContext, containerId: string) {
  const api = createApi(), cookies = {owner:await sessionFor(owner.actor.id),reader:await sessionFor(reader.actor.id)};
  const request = async (method:string, path:string, body?:unknown, who:'owner'|'reader'='owner') => api.request('https://slate.test/api'+path, {
    method,headers:{cookie:cookies[who],origin:'https://slate.test','content-type':'application/json'},body:body?JSON.stringify(body):undefined,
  }, {...env,SLATE_PROFILE:undefined});
  const call = async (method:string,path:string,body?:unknown,who:'owner'|'reader'='owner') => {
    const response = await request(method,path,body,who), value = await response.json<any>();
    expect(response.status,JSON.stringify(value)).toBeLessThan(300); return value;
  };
  const op=()=>crypto.randomUUID();
  const db=(await call('POST','/databases',{operationKey:op(),containerId,title:'synthetic-slate-dashboard'})).value;
  let revision=db.revisionId;
  for (const field of [{id:'dashboard-date',name:'Date',type:'date',config:{},position:0},{id:'dashboard-status',name:'Status',type:'text',config:{},position:1},{id:'dashboard-person',name:'Person',type:'person',config:{},position:2}]) {
    revision=(await call('POST',`/databases/${db.id}/fields`,{operationKey:op(),expectedRevisionId:revision,field})).value.revisionId;
  }
  const view={id:op(),name:'Overview',layout:'table',filters:[],sorts:[],groups:[],calculations:{},display:{},position:0};
  await call('POST',`/databases/${db.id}/views`,{operationKey:op(),expectedRevisionId:revision,view});
  const records=[];
  for(const [index,title] of ['Earlier work','Current work','Restricted merger'].entries()){
    const record=(await call('POST',`/databases/${db.id}/records`,{operationKey:op(),title,values:{'dashboard-date':index===0?'2026-09-01':'2026-10-20','dashboard-status':index===2?'Restricted merger':'Open','dashboard-person':[index===0?owner.actor.id:reader.actor.id]}})).value;
    records.push(record);
    // Public page mutation makes only this record restricted; the owner retains access.
    if(index===2) await call('POST','/sharing',{operationKey:op(),targetKind:'page',targetId:record.pageId,principalKind:'member',principalId:owner.actor.id,level:'full'});
  }
  // Restrict the third record using the product's existing access-mode command.
  await call('PUT',`/sharing/pages/${records[2].pageId}/inheritance`,{operationKey:op(),expectedRevisionId:(await call('GET',`/pages/${records[2].pageId}`)).page.revisionId,restricted:true});
  const host=(await call('POST','/pages',{operationKey:op(),containerId,title:'Delivery dashboard'})).value;
  for(const pageId of [host.pageId,db.pageId]) await call('POST','/sharing',{operationKey:op(),targetKind:'page',targetId:pageId,principalKind:'member',principalId:reader.actor.id,level:'view'});
  const tiles=Array.from({length:4},(_,i)=>({id:op(),title:`Tile ${i+1}`,kind:i===3?'view':'chart',databaseId:db.id,viewId:view.id,dateField:'dashboard-date',personField:'dashboard-person',group:'dashboard-status',calculation:'count'}));
  const definition={tiles,filters:{}};
  const saved=await call('PUT',`/pages/${host.pageId}/blocks`,{operationKey:op(),expectedRevisionId:host.revisionId,blocks:[{id:op(),blockType:'dashboard',treePosition:'1',content:{definition}}]});
  expect((await call('GET',`/pages/${host.pageId}`)).blocks[0].content.definition).toEqual(definition);
  const totals=(value:any)=>value.tiles.map((tile:any)=>tile.records?.length ?? tile.series?.reduce((sum:number,item:any)=>sum+item.value,0));
  const query=(filters:unknown,who:'owner'|'reader'='owner')=>call('POST',`/pages/${host.pageId}/dashboard`,{tiles,filters},who);
  expect(totals(await query({}))).toEqual([3,3,3,3]);
  const limited=await query({},'reader');
  expect(totals(limited)).toEqual([2,2,2,2]);
  expect(JSON.stringify(limited)).not.toContain('Restricted merger');
  expect(JSON.stringify(limited)).not.toContain(records[2].pageId);
  expect(totals(await query({from:'2026-10-01'}))).toEqual([2,2,2,2]);
  expect(totals(await query({from:'2026-10-01'},'reader'))).toEqual([1,1,1,1]);
  expect(totals(await query({personId:owner.actor.id}))).toEqual([1,1,1,1]);
  expect((await request('POST',`/pages/${host.pageId}/dashboard`,{tiles,filters:{from:'not a date'}})).status).toBe(400);
  const denied={...tiles[0],databaseId:'unavailable-database'};
  expect((await call('POST',`/pages/${host.pageId}/dashboard`,{tiles:[denied],filters:{}},'reader')).tiles).toEqual([{id:denied.id,state:'access-needed'}]);
  const copy=(await call('POST',`/pages/${host.pageId}/duplicate`,{operationKey:op(),containerId})).value;
  expect((await call('GET',`/pages/${copy.pageId}`)).blocks[0].content.definition).toEqual(definition);
}
