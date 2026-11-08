interface NativeResponse {
 status:number;
 data?:any;
 headers?:Record<string,string>;
 bytes?:Uint8Array;
}
interface CoverageDoor {
 ownerId:string;
 memberId:string;
 removableMemberId:string;
 containerId:string;
 workspaceId:string;
 host:string;
 key:()=>string;
 request:(method:string,path:string,body?:unknown,actor?:string,headers?:Record<string,string>)=>Promise<NativeResponse>;
 importFixture:()=>Promise<Uint8Array>;
 runScheduled:()=>Promise<void>;
}
export interface CoverageReceipt {
 family:string;
 action:string;
 actorId:string;
 target:{kind:string;id:string};
 receipt:{operationKey:string;activityId:string;committedAt:string};
}
export function activityCoverageProof(door:CoverageDoor):Promise<{
 redactedPageIds:string[];
 receipts:CoverageReceipt[];
 automation:any[];
 import:any;
 workspaceExport:any;
 refusals:string[];
 unchanged:string[];
 pageId:string;
 memberContainerGrant:string;
}>;
