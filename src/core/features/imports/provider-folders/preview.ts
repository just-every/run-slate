import type {FeatureContext} from '../../../app/feature-context';
import {requestHash} from '../../../app/operations';
import {requirePageLevel} from '../../sharing/current-access';
import type {NormalizedImport} from '../types';
import {openFolderConnection} from './connections';
import {collectFolder} from './traverse';
import type {FolderReport} from './types';
export interface FolderSelection {connectionId:string;folderId:string;destination:{pageId:string;expectedRevisionId:string}}
export function emptyFolderReport():FolderReport{return {imported:[],notImported:[],warnings:[],folders:0};}
export async function folderFingerprint(input:FolderSelection,parsed:NormalizedImport,report:FolderReport){const media=await Promise.all(parsed.media.map(async item=>({...item,bytes:await requestHash(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',item.bytes as Uint8Array<ArrayBuffer>))))})));return requestHash({connectionId:input.connectionId,folderId:input.folderId,destination:input.destination,parsed:{...parsed,media},report});}
export async function previewProviderFolder(ctx:FeatureContext,input:FolderSelection){await requirePageLevel(ctx,input.destination.pageId,'edit');const {adapter}=await openFolderConnection(ctx,input.connectionId),report=emptyFolderReport(),parsed=await collectFolder(adapter,input.folderId,report);report.counts={pages:parsed.pages.length,documents:report.imported.length,files:parsed.media.length};return {fingerprint:await folderFingerprint(input,parsed,report),tree:report.tree,report,privateAccess:'importing-member-only' as const};}
