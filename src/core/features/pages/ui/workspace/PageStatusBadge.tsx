import type {DocumentView} from '../../../../client/content';
import {useResource} from '../../../../client/useResource';
export function PageStatusBadge({document}:{document:DocumentView}){
 const statuses=useResource<{items:{key:string;label:string;requiresVerification:boolean}[]}>('/api/status');
 const key=(document.properties as {statusKey?:string})?.statusKey;
 const status=statuses.data?.items.find(s=>s.key===key);
 const verificationOnly=document.policyProfile['page.status.v1']==='verification-only';
 return status&&(!verificationOnly||status.requiresVerification)?<span className="page-status-chip">{status.label}</span>:null;
}
