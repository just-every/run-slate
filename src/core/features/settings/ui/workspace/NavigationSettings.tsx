import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../../client/transport';
import {ActionDialog} from '../../../../app/ui/ActionDialog';
type Destination={id:string;label:string;href:string;visible:boolean};
export function NavigationSettings(){
 const resource=useResource<{destinations:Destination[];revisionId:string|null}>('/api/navigation/configuration');
 const [draft,setDraft]=useState<Destination[]|null>(null);
 return <section><h3>Workspace navigation</h3><button className="secondary-button" disabled={!resource.data} onClick={()=>setDraft(structuredClone(resource.data!.destinations))}>Configure navigation</button>{draft?<ActionDialog title="Workspace navigation" action="Save navigation" onClose={()=>setDraft(null)} onSubmit={async()=>{await mutate('/api/navigation/configuration',{operationKey:operationKey(),expectedRevisionId:resource.data!.revisionId,destinations:draft},'PUT');resource.reload();window.dispatchEvent(new Event('slate:navigation-changed'));}}><p>Order and visibility apply to every policy profile.</p>{draft.map((item,index)=><fieldset key={item.id}><legend>{item.id}</legend><label>Destination label<input value={item.label} onChange={e=>setDraft(draft.map((row,i)=>i===index?{...row,label:e.target.value}:row))}/></label><label><input type="checkbox" checked={item.visible} onChange={e=>setDraft(draft.map((row,i)=>i===index?{...row,visible:e.target.checked}:row))}/>Visible</label><button type="button" disabled={!index} onClick={()=>{const next=[...draft];[next[index-1],next[index]]=[next[index],next[index-1]];setDraft(next);}}>Move up</button></fieldset>)}</ActionDialog>:null}</section>;
}
