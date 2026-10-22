import {z} from 'zod';
export const fileProviders=['google-drive','sharepoint'] as const;
export const fileProviderLabels={'google-drive':'Google Drive',sharepoint:'SharePoint / OneDrive'};
const identifier=/^[A-Za-z0-9_!-][A-Za-z0-9_!.-]{0,199}$/;
export const providerIdentifier=(value:string)=>identifier.test(value);
export const fileReferenceSchema=z.object({provider:z.enum(fileProviders),fileId:z.string().max(401),url:z.string().url().max(2000)}).strict().superRefine((value,ctx)=>{
 const ids=value.provider==='sharepoint'?value.fileId.split('/'):[value.fileId];
 if(ids.length!==(value.provider==='sharepoint'?2:1)||ids.some(id=>!providerIdentifier(id)))ctx.addIssue({code:'custom',message:'Invalid provider file ID.'});
 let url:URL;try{url=new URL(value.url);}catch{ctx.addIssue({code:'custom',message:'Use the provider file link.'});return;}
 const host=url.hostname;
 const valid=value.provider==='google-drive'?host==='drive.google.com'||host==='docs.google.com':host==='onedrive.live.com'||/^[a-z0-9-]+\.sharepoint\.com$/.test(host);
 if(!valid||url.protocol!=='https:'||url.username||url.password||url.port||url.hash||(url.search&&!(host==='onedrive.live.com'&&[...url.searchParams.keys()].every(key=>['id','cid'].includes(key)))))ctx.addIssue({code:'custom',message:'Use the provider file link.'});
});
export type FileReference=z.infer<typeof fileReferenceSchema>;
export interface FileMetadata {title:string;owner:string;modifiedAt:string;type:string}
export type FileCardState={state:'readable';metadata:FileMetadata}|{state:'request-access';connect:boolean}|{state:'unavailable'|'failed'};
