export type CodeProvider='github'|'gitlab';
export type CodeKind='pull-request'|'issue'|'commit'|'release'|'code';
export interface CodeReference {provider:CodeProvider;kind:CodeKind;repository:string;item:string;url:string;path?:string;first?:number;last?:number}
const part=(value:string)=>/^[A-Za-z0-9_.-]+$/.test(value)&&!['.','..'].includes(value);
const sha=(value:string)=>/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);
/** Provider links become stable references. Search parameters never enter card state. */
export function codeReference(raw:string):CodeReference|null{
 try{
  const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.port||!['github.com','gitlab.com'].includes(url.hostname))return null;
  const provider:CodeProvider=url.hostname==='github.com'?'github':'gitlab';
  const pieces=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const marker=provider==='github'?2:pieces.indexOf('-');
  const repo=pieces.slice(0,marker);
  if(marker<2||provider==='github'&&repo.length!==2||!repo.every(part))return null;
  const rest=pieces.slice(marker+(provider==='gitlab'?1:0)),route=rest[0],item=rest[1];
  if(!item||/[\x00-\x1f\x7f]/.test(item))return null;
  let kind:CodeKind|undefined,path:string|undefined,first:number|undefined,last:number|undefined;
  if((provider==='github'?route==='pull':route==='merge_requests')&&/^[1-9]\d*$/.test(item)&&rest.length===2)kind='pull-request';
  else if(route==='issues'&&/^[1-9]\d*$/.test(item)&&rest.length===2)kind='issue';
  else if(route==='commit'&&sha(item)&&rest.length===2)kind='commit';
  else if(route==='releases'){
   if(provider==='github'){if(item!=='tag'||rest.length<3)return null;kind='release';}
   else kind='release';
  }else if(route==='blob'&&sha(item)&&rest.length>=3){
   const match=/^#L(\d+)(?:-L?(\d+))?$/.exec(url.hash);if(!match)return null;
   first=Number(match[1]);last=Number(match[2]??match[1]);
   if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first<1||last<first||last-first+1>200)return null;
   const pathParts=rest.slice(2);if(pathParts.some(x=>!x||x.includes('/')||x==='.'||x==='..'||/[\x00-\x1f\x7f]/.test(x)))return null;
   path=pathParts.join('/');kind='code';
  }
  if(!kind)return null;
  return {provider,kind,repository:repo.join('/'),item:kind==='release'?rest.slice(provider==='github'?2:1).join('/'):item.toLowerCase(),url:url.origin+url.pathname+url.hash,...(path?{path,first,last}:{})};
 }catch{return null;}
}
export interface CodeMetadata {title:string;author:string;time:string;state:string;checks:{name:string;state:string}[];code?:{path:string;sha:string;first:number;lines:string[];changed:boolean;branch:string;head:string}}
export type CodeCardState={state:'connect'|'request-access'|'unavailable'|'failed'}|{state:'readable';reference:CodeReference;metadata:CodeMetadata};
/** Old generic previews never bypass a reader's current provider authority. */
export function codeLinkContent(content:any){
 const source=typeof content?.url==='string'?codeReference(content.url):null;
 return source?{url:source.url,display:content.display??'card',previewState:'ready',source}:content;
}
export function projectCodeLinks(blocks:any[]):any[]{
 return blocks.map(block=>block.blockType==='link-card'?{...block,content:codeLinkContent(block.content)}:block);
}
