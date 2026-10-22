import {vi} from 'vitest';
/** Synthetic S3 network edge; signature failures are provider refusals. */
export function s3Network(accessKeyId:string,secret:string){
 const objects=new Map<string,Uint8Array>(),uploads=new Map<string,Map<number,Uint8Array>>(),deleted:string[]=[];let fail=false,parts=0;
 const encoder=new TextEncoder(),hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
 const sha=async(b:Uint8Array<ArrayBuffer>)=>hex(await crypto.subtle.digest('SHA-256',b));
 const hmac=async(key:Uint8Array<ArrayBuffer>,text:string)=>new Uint8Array(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']),encoder.encode(text)));
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);if(url.origin!=='https://synthetic-slate-1.example.test')throw Error('Unexpected provider request');
  const body=new Uint8Array(await request.arrayBuffer()),auth=request.headers.get('authorization')??'',match=/^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]+)$/.exec(auth);
  if(!match||match[1]!==accessKeyId||await sha(body)!==request.headers.get('x-amz-content-sha256'))return new Response('synthetic-slate-900',{status:403});
  const names=match[3]!.split(';'),query=[...url.searchParams].sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv)).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
  const canonical=[request.method,url.pathname,query,names.map(n=>n+':'+request.headers.get(n)+'\n').join(''),match[3],await sha(body)].join('\n'),scope=match[2]!,date=request.headers.get('x-amz-date')!;
  const [day,region,service,ending]=scope.split('/');let key=await hmac(encoder.encode('AWS4'+secret),day!);for(const part of [region,service,ending])key=await hmac(key,part!);
  const signature=hex((await hmac(key,`AWS4-HMAC-SHA256\n${date}\n${scope}\n${await sha(encoder.encode(canonical))}`)).buffer);
  if(signature!==match[4]||fail)return new Response('synthetic-slate-900',{status:403});
  const objectKey=decodeURIComponent(url.pathname.split('/').slice(2).join('/')),uploadId=url.searchParams.get('uploadId');
  if(request.method==='HEAD')return new Response(null);
  if(request.method==='POST'&&url.searchParams.has('uploads')){const id=crypto.randomUUID();uploads.set(id,new Map());return new Response(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);}
  if(uploadId){const upload=uploads.get(uploadId);if(!upload)return new Response(null,{status:404});
   if(request.method==='PUT'){upload.set(Number(url.searchParams.get('partNumber')),body);parts++;return new Response(null,{headers:{etag:'"synthetic-slate-'+parts+'"'}});}
   if(request.method==='POST'){if(objects.has(objectKey))return new Response(null,{status:412});const rows=[...upload].sort(([a],[b])=>a-b),bytes=new Uint8Array(rows.reduce((n,[,p])=>n+p.length,0));let at=0;for(const [,p]of rows){bytes.set(p,at);at+=p.length;}objects.set(objectKey,bytes);uploads.delete(uploadId);return new Response('<CompleteMultipartUploadResult><ETag>synthetic-slate-500</ETag></CompleteMultipartUploadResult>');}
   if(request.method==='DELETE'){uploads.delete(uploadId);return new Response(null,{status:204});}
  }
  if(request.method==='PUT'){if(objects.has(objectKey))return new Response(null,{status:412});objects.set(objectKey,body);return new Response(null);}
  if(request.method==='GET'){const bytes=objects.get(objectKey);return bytes?new Response(bytes as Uint8Array<ArrayBuffer>,{headers:{'content-length':String(bytes.length)}}):new Response(null,{status:404});}
  if(request.method==='DELETE'){objects.delete(objectKey);deleted.push(objectKey);return new Response(null,{status:204});}
  return new Response(null,{status:400});
 });
 return {objects,uploads,deleted,get parts(){return parts;},setFailure(value:boolean){fail=value;},restore(){fetch.mockRestore();}};
}
