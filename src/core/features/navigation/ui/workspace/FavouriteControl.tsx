import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../../client/transport';
export function FavouriteControl({kind,id}:{kind:'page'|'container'|'database';id:string}){
 const resource=useResource<{favourites:{kind:string;id:string}[]}>('/api/navigation');const [error,setError]=useState<unknown>();
 const enabled=resource.data?.favourites.some(r=>r.kind===kind&&r.id===id)??false;
 return <><button aria-pressed={enabled} disabled={!resource.data} onClick={()=>void mutate('/api/navigation/favourites',{operationKey:operationKey(),kind,id,enabled:!enabled},'PUT').then(()=>{resource.reload();window.dispatchEvent(new Event('slate:navigation-changed'));}).catch(setError)}>{enabled?'Remove from favourites':'Add to favourites'}</button>{error?<p role="alert">{errorMessage(error)}</p>:null}</>;
}
