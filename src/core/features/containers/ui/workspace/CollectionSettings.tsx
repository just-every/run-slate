import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../../client/transport';
export function CollectionSettings({id,onSaved}:{id:string;onSaved:()=>void}){
 const resource=useResource<{revisionId:string;isCollection:boolean}>(`/api/containers/${id}/collection`),[error,setError]=useState<unknown>(),[pending,setPending]=useState(false),[draft,setDraft]=useState<boolean>();
 return <section aria-label="Knowledge collection"><label><input type="checkbox" aria-label="Use this space as a knowledge collection" checked={draft??resource.data?.isCollection??false} disabled={!resource.data||pending} onChange={event=>{const isCollection=event.target.checked;setDraft(isCollection);setPending(true);setError(undefined);void mutate(`/api/containers/${id}/collection`,{operationKey:operationKey(),expectedRevisionId:resource.data!.revisionId,isCollection},'PUT').then(async()=>{await resource.reload();onSaved();}).catch(setError).finally(()=>{setPending(false);setDraft(undefined);});}}/>Use this space as a knowledge collection</label>{pending?<p role="status">Saving collection setting…</p>:null}<p>Collections use the space’s existing content list for short knowledge cards.</p>{error||resource.error?<p role="alert">{errorMessage(error??resource.error)}</p>:null}</section>;
}
