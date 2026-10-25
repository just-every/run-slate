import type {CodeProvider} from './reference';
export class CodeWriteScopeError extends Error{
 constructor(){super('Use a read-only personal access token.');}
}
const readable={
 github:new Set(['read:user','user:email','read:org','read:project','read:discussion','read:packages','read:enterprise','read:gpg_key','read:public_key','read:repo_hook','read:audit_log']),
 gitlab:new Set(['read_api','read_user','read_repository','read_registry','read_virtual_registry','openid','profile','email']),
};
/** Unknown authority is refused along with every reported write scope. */
export function requireReadScopes(provider:CodeProvider,scopes:string[]){
 if(scopes.some(scope=>!readable[provider].has(scope)))throw new CodeWriteScopeError();
}
