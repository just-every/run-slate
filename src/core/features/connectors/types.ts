export type Provider = 'google-drive' | 'slack' | 'github' | 'happytohelp' | 'orbit';
export interface ConnectionConfig { provider:Provider; accountId:string; memberId:string; }
export interface ProviderIdentity { accountId:string; principalId:string; label:string }
export interface RecordState {schema:'crm.handoff-state/1';kind:'crm.handoff';state:'open'|'completed'|'cancelled'}
export interface RemoteDocument { recordState?:RecordState; remoteId:string; revision:string; title:string; text:string; acl:{accountId:string; principalId:string;installationId?:string;origin?:string}; observedAt:string }
export interface Adapter {
 identity():Promise<ProviderIdentity>;
 checkPublic?(remoteId:string):Promise<boolean>;
 read(remoteId:string):Promise<RemoteDocument>;
 check(remoteId:string):Promise<{revision:string;principalId:string;accountId:string}>;
}
export interface ConnectionRow {id:string;workspace_id:string;member_id:string;provider:Provider;account_id:string;credential_ciphertext:string|null;config_json:string;state:string;revision_id:string}
export const capabilities = {
 'google-drive': {read:true, exactRemoteRevision:false, retainedExactRevision:true, write:false, requirements:'A per-person Google OAuth access token with drive.readonly and userinfo.email scopes. Every output recipient connects their own identity.'},
 slack: {read:true, exactRemoteRevision:false, retainedExactRevision:true, write:false, requirements:'A Slack user OAuth token with channels:history, groups:history, im:history, mpim:history and channels:read/groups:read as needed; account is the Slack team ID. Bot tokens are rejected.'},
 github: {read:true, exactRemoteRevision:false, retainedExactRevision:true, write:false, requirements:'A per-person GitHub token with read access to the selected repository issues. Account is the authenticated GitHub login.'},
 orbit: {read:true,write:true,requirements:'Configure the exact native Orbit installation and complete source-owned personal consent. Live capabilities are negotiated per grant. Handoff records only; customer outreach remains an exact native human action.'},
 happytohelp: {read:true,write:true,requirements:'Configure the exact native HappyToHelp installation and complete scoped personal consent. Live capabilities are negotiated per grant. Conversation evidence and article repair only; customer replies and account activation are not delegated.'},
} as const;
