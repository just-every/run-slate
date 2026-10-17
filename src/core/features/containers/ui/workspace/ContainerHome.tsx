import { useId, useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { mutate, operationKey } from '../../../../client/transport';
import { RequestState } from '../../../../app/ui/RequestState';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
import { PageWorkspace } from '../../../pages/ui/workspace/PageWorkspace';

interface HomeView { pageId:string|null; revisionId:string; canManage:boolean }
interface PageChoice { id:string; title:string; pageKind:string; lifecycle:string }

export function ContainerHome({containerId,name,onSaved}:{containerId:string;name:string;onSaved:()=>void}) {
  const home=useResource<HomeView>(`/api/containers/${encodeURIComponent(containerId)}/home`);
  const [choosing,setChoosing]=useState(false);
  return <section className="space-home" aria-label="Space home">
    <RequestState loading={home.loading} error={home.error} retry={home.reload}>
      {home.data ? <>
        {home.data.canManage ? <div className="space-home-actions"><button type="button" className="secondary-button" onClick={()=>setChoosing(true)}>{home.data.pageId ? 'Change home page' : 'Set up space home'}</button></div> : null}
        {home.data.pageId ? <PageWorkspace pageId={home.data.pageId} host={{trail:[{label:'Spaces',href:'/app/containers'},{label:name,href:`/app/containers/${encodeURIComponent(containerId)}`}]}}/> : <p className="muted">There is no space home available with your current access. You can browse the pages in Content.</p>}
      </> : null}
    </RequestState>
    {choosing && home.data ? <HomeChoice containerId={containerId} home={home.data} onClose={()=>setChoosing(false)} onSaved={async()=>{await home.reload();onSaved();}}/> : null}
  </section>;
}

function HomeChoice({containerId,home,onClose,onSaved}:{containerId:string;home:HomeView;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const choiceId=useId();
  const pages=useResource<{items:PageChoice[]}>(`/api/pages?containerId=${encodeURIComponent(containerId)}`);
  return <ActionDialog title="Space home page" action="Save home page" onClose={onClose} onSubmit={async data=>{
    const selected=data.get('pageId');
    if(typeof selected!=='string'||!selected)throw new Error('Choose a home page before saving.');
    await mutate(`/api/containers/${encodeURIComponent(containerId)}/home`,{operationKey:operationKey(),expectedRevisionId:home.revisionId,...(selected==='create'?{create:true}:{pageId:selected})},'PUT');
    await onSaved();
  }}>
    <p>The home opens first when someone visits this space. It keeps the page’s editing and sharing permissions.</p>
    <RequestState loading={pages.loading} error={pages.error} retry={pages.reload}>
      <label htmlFor={choiceId}>Home page</label><select id={choiceId} name="pageId" defaultValue={home.pageId??'create'} required>
        <option value="create">Create a new home page</option>
        {pages.data?.items.filter(page=>page.pageKind==='page'&&['live','live-with-unpublished-changes'].includes(page.lifecycle)).map(page=><option key={page.id} value={page.id}>{page.title||'Untitled'}</option>)}
      </select>
    </RequestState>
  </ActionDialog>;
}
