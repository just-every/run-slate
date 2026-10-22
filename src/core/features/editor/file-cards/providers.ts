import {ApiProblem} from '../../../app/problems';
import {providerJson} from '../../connectors/http';
import {fileReferenceSchema,providerIdentifier,type FileReference,type FileMetadata} from './reference';
interface DriveItem {id:string;name:string;mimeType:string;modifiedTime:string;owners?:{displayName?:string}[];trashed?:boolean;webViewLink?:string}
interface GraphItem {id:string;name:string;webUrl:string;lastModifiedDateTime:string;folder?:unknown;file?:{mimeType?:string};deleted?:unknown;shared?:{owner?:Identity}}
interface Identity {user?:{displayName?:string};group?:{displayName?:string}}
export interface PickedFile extends FileReference {title:string;folder:boolean}
const id=(value:string)=>{if(!providerIdentifier(value))throw new ApiProblem(400,'INVALID_FILE_ID','Use a provider file or folder ID.');return encodeURIComponent(value);};
const metadata=(title:string,owner:string|undefined,modifiedAt:string,type:string|undefined):FileMetadata=>{
 if(!title||!owner||!type||!Number.isFinite(Date.parse(modifiedAt)))throw new ApiProblem(502,'FILE_METADATA_INCOMPLETE','The provider did not supply complete file metadata.');
 return {title,owner,modifiedAt:new Date(modifiedAt).toISOString(),type};
};
const graphBase=(drive:string)=>`https://graph.microsoft.com/v1.0/drives/${id(drive)}`;
const googleFields='id,name,mimeType,modifiedTime,owners(displayName),trashed,webViewLink';
const googleReference=(item:DriveItem):PickedFile=>({...fileReferenceSchema.parse({provider:'google-drive',fileId:item.id,url:`https://drive.google.com/file/d/${id(item.id)}/view`}),title:item.name,folder:item.mimeType==='application/vnd.google-apps.folder'});
const graphReference=(item:GraphItem,drive:string):PickedFile=>({...fileReferenceSchema.parse({provider:'sharepoint',fileId:`${drive}/${item.id}`,url:item.webUrl}),title:item.name,folder:!!item.folder});
export async function browseProviderFiles(provider:FileReference['provider'],token:string,drive:string|null,folder:string){
 if(provider==='google-drive'){
  id(folder);const query=new URLSearchParams({q:`'${folder}' in parents and trashed = false`,fields:`nextPageToken,incompleteSearch,files(${googleFields})`,pageSize:'100',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
  const result=await providerJson<{files:DriveItem[];nextPageToken?:string;incompleteSearch?:boolean}>(`https://www.googleapis.com/drive/v3/files?${query}`,token);
  return {items:result.files.filter(item=>!item.trashed).map(googleReference),more:!!result.nextPageToken||result.incompleteSearch===true};
 }
 if(!drive)throw new ApiProblem(400,'DRIVE_REQUIRED','Connect a SharePoint or OneDrive drive.');
 const target=folder==='root'?'/root':`/items/${id(folder)}`;
 const result=await providerJson<{value:GraphItem[];'@odata.nextLink'?:string}>(`${graphBase(drive)}${target}/children?$top=100`,token);
 return {items:result.value.filter(item=>!item.deleted).map(item=>graphReference(item,drive)),more:!!result['@odata.nextLink']};
}
export async function providerFileMetadata(reference:FileReference,token:string):Promise<FileMetadata>{
 if(reference.provider==='google-drive'){
  const item=await providerJson<DriveItem>(`https://www.googleapis.com/drive/v3/files/${id(reference.fileId)}?fields=${googleFields}&supportsAllDrives=true`,token);
  if(item.trashed)throw new ApiProblem(404,'SOURCE_DELETED','The file is unavailable.');
  return metadata(item.name,item.owners?.map(owner=>owner.displayName).filter(Boolean).join(', '),item.modifiedTime,item.mimeType);
 }
 const [drive,file]=reference.fileId.split('/');
 const item=await providerJson<GraphItem>(`${graphBase(drive!)}/items/${id(file!)}?$select=id,name,webUrl,lastModifiedDateTime,file,deleted,shared`,token);
 if(item.deleted)throw new ApiProblem(404,'SOURCE_DELETED','The file is unavailable.');
 let owner=item.shared?.owner;
 if(!owner)owner=(await providerJson<{owner?:Identity}>(graphBase(drive!)+'?$select=owner',token)).owner;
 return metadata(item.name,owner?.user?.displayName??owner?.group?.displayName,item.lastModifiedDateTime,item.file?.mimeType);
}
