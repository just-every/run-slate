import {useResource} from '../../../../client/useResource';
import {useCreatePage} from '../../../../app/ui/useCreatePage';
import {errorMessage} from '../../../../client/transport';
export function CollectionActions({id,canCreate}:{id:string;canCreate:boolean}){
 const resource=useResource<{isCollection:boolean}>(`/api/containers/${id}/collection`),creation=useCreatePage();
 return resource.data?.isCollection?<section aria-label="Knowledge collection"><p>Knowledge collection · browse cards in Content</p>{canCreate?<button className="secondary-button" disabled={creation.pending} onClick={()=>void creation.create(async()=>({containerId:id,title:'Untitled card',pageKind:'card'}))}>Create knowledge card</button>:null}{creation.error?<p role="alert">{errorMessage(creation.error)}</p>:null}{creation.prompt}</section>:null;
}
