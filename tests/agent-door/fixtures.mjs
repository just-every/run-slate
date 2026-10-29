import {randomUUID} from 'node:crypto';
export default async function({request,origin,cookie,phase}){
 const call=async(path,method='GET',body)=>{
  const r=await request(new URL(path,origin).href,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok){const e=await r.json().catch(()=>({}));console.error('Native fixture refusal',phase,method,path.split('/').slice(0,3).join('/'),r.status,e.code??'unknown');throw new Error('Native fixture refused');}return r.json();
 };
 const container=await call('/api/containers','POST',{operationKey:randomUUID(),name:'Curator sources'});
 const sensitiveContainer=await call('/api/containers','POST',{operationKey:randomUUID(),name:'Sensitive records',description:'SSN 123-45-6789'});
 const make=async(title,text)=>{const r=await call('/api/pages','POST',{operationKey:randomUUID(),containerId:container.value.id,title,blocks:[{id:randomUUID(),blockType:'paragraph',content:{text:[{text}]},treePosition:'a'}]});return {id:r.value.pageId};};
 const page=await make('Service guide','Current operating instructions');
 const sensitive=await make('SSN 123-45-6789','SSN 123-45-6789');
 const publicPage=await make('Public guide','Public operating instructions');
 let doc=await call('/api/pages/'+publicPage.id);
 if(!doc.publishedRevisionId){await call('/api/pages/'+publicPage.id+'/publish','POST',{operationKey:randomUUID(),expectedRevisionId:doc.page.revisionId});doc=await call('/api/pages/'+publicPage.id);}
 await call('/api/publishing/'+publicPage.id,'POST',{operationKey:randomUUID(),expectedRevisionId:doc.page.revisionId,host:new URL(origin).host,slug:'guide-'+randomUUID()});
 const workspace=await call('/api/workspace');
 await call('/api/workspace','PUT',{name:workspace.name,mark:workspace.mark,description:workspace.description,guestAccess:workspace.guestAccess,publicLinkAccess:workspace.publicLinkAccess,anonymousAccess:workspace.anonymousAccess,policies:workspace.policies,operationKey:randomUUID(),expectedRevisionId:workspace.revisionId,description:'',policies:workspace.policies});
 return {values:{container:{id:container.value.id},sensitiveContainer:{id:sensitiveContainer.value.id},page,sensitive,public:publicPage,blockIds:Object.fromEntries(['create','ordinary','sensitive','external'].map(key=>[key,randomUUID()]))}};
}
