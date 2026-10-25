import {codeRead,CodeProviderError} from './http';
import type {CodeReference,CodeMetadata,CodeProvider} from './reference';
const text=(v:unknown)=>{if(typeof v!=='string')throw new CodeProviderError('failed');return v;};
const checkedSha=(v:unknown)=>{const s=text(v);if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(s))throw new CodeProviderError('failed');return s;};
const segment=encodeURIComponent;
const githubBase=(ref:CodeReference)=>'/repos/'+ref.repository.split('/').map(segment).join('/');
const gitlabBase=(ref:CodeReference)=>'/api/v4/projects/'+segment(ref.repository);
async function checks(provider:CodeProvider,base:string,sha:string,token:string){
 if(provider==='github'){
  const value=await codeRead(provider,base+'/commits/'+segment(sha)+'/check-runs',token);
  if(!Array.isArray(value.check_runs))throw new CodeProviderError('failed');
  return value.check_runs.map((c:any)=>({name:text(c.name),state:text(c.conclusion??c.status)}));
 }
 const value=await codeRead(provider,base+'/repository/commits/'+segment(sha)+'/statuses',token);
 if(!Array.isArray(value))throw new CodeProviderError('failed');
 return value.map((c:any)=>({name:text(c.name),state:text(c.status)}));
}
async function source(ref:CodeReference,base:string,sha:string,token:string){
 const path=ref.provider==='github'?base+'/contents/'+ref.path!.split('/').map(segment).join('/')+'?ref='+segment(sha):base+'/repository/files/'+segment(ref.path!)+'/raw?ref='+segment(sha);
 const value=text(await codeRead(ref.provider,path,token,true)).split(/\r?\n/);
 if(ref.first!>value.length||ref.last!>value.length)throw new CodeProviderError('unavailable');
 return value.slice(ref.first!-1,ref.last);
}
/** Every result is ephemeral and obtained with the current reader's credential. */
export async function codeMetadata(ref:CodeReference,token:string):Promise<CodeMetadata>{
 const gh=ref.provider==='github',base=gh?githubBase(ref):gitlabBase(ref),provider=ref.provider;
 if(ref.kind==='code'){
  const repository=await codeRead(provider,base,token),branch=text(repository.default_branch);
  const current=await codeRead(provider,gh?base+'/commits/'+segment(branch):base+'/repository/branches/'+segment(branch),token),head=checkedSha(gh?current.sha:current.commit?.id);
  const pinned=await source(ref,base,ref.item,token),latest=await source(ref,base,head,token);
  return {title:ref.path!,author:'',time:'',state:'pinned',checks:await checks(provider,base,ref.item,token),code:{path:ref.path!,sha:ref.item,first:ref.first!,lines:pinned,changed:pinned.join('\n')!==latest.join('\n'),branch,head}};
 }
 let item:any,sha:string|undefined,title:string,author:string,time:string,state:string;
 if(ref.kind==='pull-request'){
  item=await codeRead(provider,gh?base+'/pulls/'+segment(ref.item):base+'/merge_requests/'+segment(ref.item),token);
  title=text(item.title);author=text(gh?item.user?.login:item.author?.username);time=text(item.updated_at);
  state=gh?(item.merged===true?'merged':item.draft===true?'draft':text(item.state)):(item.draft===true?'draft':text(item.state));
  sha=checkedSha(gh?item.head?.sha:item.sha);
 }else if(ref.kind==='issue'){
  item=await codeRead(provider,base+'/issues/'+segment(ref.item),token);
  title=text(item.title);author=text(gh?item.user?.login:item.author?.username);time=text(item.updated_at);state=text(item.state);
 }else if(ref.kind==='commit'){
  item=await codeRead(provider,gh?base+'/commits/'+segment(ref.item):base+'/repository/commits/'+segment(ref.item),token);
  sha=checkedSha(gh?item.sha:item.id);title=text(gh?item.commit?.message:item.title).split('\n')[0]!;
  author=text(gh?item.author?.login??item.commit?.author?.name:item.author_name);time=text(gh?item.commit?.author?.date:item.committed_date);state='committed';
 }else{
  item=await codeRead(provider,gh?base+'/releases/tags/'+segment(ref.item):base+'/releases/'+segment(ref.item),token);
  title=text(item.name??item.tag_name);author=text(gh?item.author?.login:item.author?.username);time=text(gh?item.published_at??item.created_at:item.released_at);
  state=item.draft===true?'draft':'released';
  if(gh){const commit=await codeRead(provider,base+'/commits/'+segment(ref.item),token);sha=checkedSha(commit.sha);}
  else sha=checkedSha(item.commit?.id);
 }
 if(state==='opened')state='open';
 return {title,author,time,state,checks:sha?await checks(provider,base,sha,token):[]};
}
