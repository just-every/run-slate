import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../../client/transport';
import type {Refinements} from './SearchRefinements';
export type SearchQuery=Partial<Refinements>&{query?:string;kind?:string;includeArchived?:boolean};
export function SavedSearches({onChoose,version}:{onChoose:(query:SearchQuery)=>void;version:number}) {
 const resource=useResource<{items:{id:string;name:string;query:SearchQuery;revisionId:string}[]}>(`/api/search/saved?updated=${version}`);const [error,setError]=useState<unknown>();
 return <details><summary>Saved searches</summary><ul className="settings-list">{resource.data?.items.map(item=><li key={item.id}><button onClick={()=>onChoose(item.query)}>{item.name}</button><button aria-label={`Delete saved search ${item.name}`} onClick={async()=>{try{await mutate(`/api/search/saved/${item.id}`,{operationKey:operationKey(),expectedRevisionId:item.revisionId},'DELETE');resource.reload();}catch(cause){setError(cause);}}}>Remove</button></li>)}</ul>{resource.data?.items.length===0?<p>No saved searches.</p>:null}{error||resource.error?<p role="alert">{errorMessage(error||resource.error)}</p>:null}</details>;
}
