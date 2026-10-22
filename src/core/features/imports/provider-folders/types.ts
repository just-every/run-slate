import type {ImportFormat} from '../types';
export type FolderProvider='google-drive'|'sharepoint';
export interface ProviderItem {id:string;name:string;url:string;folder:boolean;readable:boolean;mimeType?:string;version?:string;size?:number}
export interface FolderAdapter {
 identity():Promise<{id:string;label:string}>;
 item(id:string):Promise<ProviderItem>;
 children(id:string):Promise<ProviderItem[]>;
 download(item:ProviderItem):Promise<{bytes:Uint8Array;format:ImportFormat;name:string}>;
}
export interface FolderConnection {id:string;workspace_id:string;member_id:string;provider:FolderProvider;principal_id:string;label:string;drive_id:string|null;credential_ciphertext:string|null;state:string;revision_id:string}
export interface FolderOmission {sourceId:string;name:string;url:string;reason:string;detail?:string}
export interface FolderReport {imported:{sourceId:string;name:string;url:string;pageId?:string}[];notImported:FolderOmission[];warnings:FolderOmission[];folders:number;tree?:{sourceId:string;parentSourceId?:string;title:string;folder:boolean}[];counts?:unknown}
