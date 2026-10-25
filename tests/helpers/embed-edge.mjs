import {appendFile,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const hosts=['embed.figma.com','miro.com','lucid.app','www.lucidchart.com','www.loom.com','www.youtube-nocookie.com','player.vimeo.com','docs.google.com','onedrive.live.com'];
export async function initializeEmbedEdge(directory){await writeFile(path.join(directory,'embed-requests.jsonl'),'');}
export async function readEmbedRequests(directory){return (await readFile(path.join(directory,'embed-requests.jsonl'),'utf8')).split('\n').filter(Boolean).map(JSON.parse);}
/** Network edge only: no Slate door is substituted. Unknown provider reads fail rather than going live. */
export async function embedEdge(request,directory,ResponseClass){
 const url=new URL(request.url);if(!hosts.includes(url.hostname)&&!(url.hostname.endsWith('.sharepoint.com')&&/\/_layouts\/15\/Doc\.aspx$/i.test(url.pathname)))return null;
 try{await readFile(path.join(directory,'embed-requests.jsonl'));}catch{return new ResponseClass('No recorded embed fixture',{status:503});}
 await appendFile(path.join(directory,'embed-requests.jsonl'),JSON.stringify({host:url.hostname,method:request.method})+'\n');
 if(request.headers.has('cookie')||request.headers.has('authorization'))throw Error('Embed probes must be anonymous');
 const headers={'content-type':'text/html',...(url.hostname.endsWith('.sharepoint.com')?{'x-frame-options':'DENY'}:url.hostname==='www.lucidchart.com'?{'content-security-policy':"frame-ancestors 'none'"}:{})};
 return new ResponseClass(request.method==='HEAD'?null:'<h1>Recorded embed</h1>',{headers});
}
