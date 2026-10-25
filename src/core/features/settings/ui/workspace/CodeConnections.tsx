import {useState} from 'react';
import {RequestState} from '../../../../app/ui/RequestState';
import {useResource} from '../../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../../client/transport';
interface Connection{id:string;provider:'github'|'gitlab';label:string;state:'connected'|'disconnected';revisionId:string}
const names={github:'GitHub',gitlab:'GitLab'};
/** Credentials leave the password field immediately and are never shown again. */
export function CodeConnections(){
 const resource=useResource<{connections:Connection[]}>('/api/embed-connections');
 const [pending,setPending]=useState(false),[error,setError]=useState<unknown>();
 async function action(work:()=>Promise<unknown>){
  if(pending)return;
  setPending(true);setError(undefined);
  try{await work();await resource.reload();}catch(cause){setError(cause);}finally{setPending(false);}
 }
 return <section id="code-accounts" aria-label="Code host connections" className="my-4 min-w-0">
  <h3>Your code accounts</h3>
  <p>Connect your GitHub or GitLab account with a read-only personal access token. Cards use your own access.</p>
  <form className="detail-form" autoComplete="off" onSubmit={event=>{
   event.preventDefault();if(pending)return;
   const form=event.currentTarget,data=new FormData(form),provider=String(data.get('provider')) as Connection['provider'],token=String(data.get('token')??'');
   (form.elements.namedItem('token') as HTMLInputElement).value='';data.delete('token');
   void action(()=>mutate('/api/embed-connections',{operationKey:operationKey(),provider,token}));
  }}>
   <fieldset disabled={pending||resource.loading||Boolean(resource.error)} className="m-0 grid min-w-0 gap-3 border-0 p-0">
    <legend className="mb-2 text-small">Connect a code account</legend>
    <label>Code host<select name="provider" defaultValue="github"><option value="github">GitHub</option><option value="gitlab">GitLab</option></select></label>
    <label>Read-only access token<input name="token" type="password" autoComplete="new-password" spellCheck={false} required/></label>
    <button type="submit" className="secondary-button">Connect code account</button>
   </fieldset>
  </form>
  {error?<p role="alert">{errorMessage(error)}</p>:null}
  <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
   <ul className="m-0 grid list-none gap-2 p-0">{resource.data?.connections.map(connection=><li key={connection.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-control border border-line p-2">
    <p className="min-w-0 break-words text-small"><strong>{names[connection.provider]}</strong> · {connection.label} · {connection.state}</p>
    <button type="button" className="secondary-button" disabled={pending||connection.state==='disconnected'} onClick={()=>void action(()=>mutate('/api/embed-connections/'+encodeURIComponent(connection.id),{operationKey:operationKey(),expectedRevisionId:connection.revisionId},'DELETE'))}>Disconnect {names[connection.provider]}</button>
   </li>)}</ul>
  </RequestState>
 </section>;
}
