import {randomUUID} from 'node:crypto';
import {appendFile,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const file=directory=>path.join(directory,'code-fixture.json');
export async function initializeCodeEdge(directory){
 const credentials=Object.fromEntries(['github','gitlab'].map(provider=>[provider,{owner:'synthetic-slate-'+randomUUID(),reader:'synthetic-slate-'+randomUUID()}]));
 await writeFile(file(directory),JSON.stringify({credentials,moved:false,writeScopes:false,denyReader:false,failed:false}));
 await writeFile(path.join(directory,'code-requests.jsonl'),'');return credentials;
}
export async function setCodeFixture(directory,changes){const previous=JSON.parse(await readFile(file(directory),'utf8'));await writeFile(file(directory),JSON.stringify({...previous,...changes}));}
export async function readCodeRequests(directory){return (await readFile(path.join(directory,'code-requests.jsonl'),'utf8')).split('\n').filter(Boolean).map(JSON.parse);}
/** Fixed-host provider boundary only. Unknown paths fail instead of reaching a live provider. */
export async function codeEdge(request,directory,ResponseClass){
 const url=new URL(request.url);if(!['https://api.github.com','https://gitlab.com'].includes(url.origin))return null;
 const fixture=JSON.parse(await readFile(file(directory),'utf8')),provider=url.hostname==='api.github.com'?'github':'gitlab',gh=provider==='github';
 const token=request.headers.get('authorization')?.replace(/^Bearer /,''),person=Object.entries(fixture.credentials[provider]).find(([,value])=>value===token)?.[0];
 if(!person||request.method!=='GET'||request.headers.has('cookie'))throw Error('Unexpected authority at the code-provider edge');
 await appendFile(path.join(directory,'code-requests.jsonl'),JSON.stringify({provider,path:url.pathname,person,method:request.method})+'\n');
 const headers={'content-type':'application/json',...(gh?{'x-oauth-scopes':fixture.writeScopes?'repo, user:email':'read:user, user:email'}:{})};
 const json=(value,status=200)=>new ResponseClass(JSON.stringify(value),{status,headers});
 const user={id:person==='owner'?1:2,login:person,username:person};
 if(url.pathname==='/user'||url.pathname==='/api/v4/user')return json(user);
 if(url.pathname==='/user/emails'||url.pathname==='/api/v4/user/emails')return json([{email:person==='owner'?'owner@test.invalid':'reader@test.invalid',verified:true,confirmed_at:'2026-10-25T00:00:00Z'}]);
 if(url.pathname==='/api/v4/personal_access_tokens/self')return json({scopes:fixture.writeScopes?['api']:['read_api','read_repository']});
 if(fixture.failed)return json({},503);
 if(person==='reader'&&fixture.denyReader)return json({},403);
 const pinned='1'.repeat(40),head=(fixture.moved?'3':'2').repeat(40);
 if(/\/(?:pulls|merge_requests)\/7$/.test(url.pathname))return json({title:(person==='owner'?'Owner':'Reader')+' review',state:gh?'open':'opened',merged:false,draft:false,user,author:user,updated_at:'2026-10-25T00:00:00Z',head:{sha:pinned},sha:pinned});
 if(/\/check-runs$/.test(url.pathname))return json({check_runs:[{name:'Build',status:'completed',conclusion:'success'}]});
 if(/\/statuses$/.test(url.pathname))return json([{name:'Pipeline',status:'success'}]);
 if(url.pathname.includes('/contents/')||url.pathname.includes('/repository/files/'))return new ResponseClass('first\n'+(fixture.moved&&url.searchParams.get('ref')===head?'changed line':'pinned <script> line')+'\nthird\n',{headers:{...headers,'content-type':'text/plain'}});
 if(gh&&url.pathname==='/repos/synthetic-slate/project/commits/main')return json({sha:head});
 if(!gh&&url.pathname.endsWith('/repository/branches/main'))return json({commit:{id:head}});
 if(gh&&url.pathname==='/repos/synthetic-slate/project'||!gh&&url.pathname==='/api/v4/projects/synthetic-slate%2Fproject')return json({default_branch:'main'});
 throw Error('Unexpected recorded code-provider path '+url.pathname);
}
