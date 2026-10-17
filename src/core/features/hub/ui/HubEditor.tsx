import { useState } from 'react';
import { useResource } from '../../../client/useResource';
import { mutate, operationKey } from '../../../client/transport';
import { RequestState } from '../../../app/ui/RequestState';
import { ActionDialog } from '../../../app/ui/ActionDialog';
import type { HubConfiguration, HubEditorView, HubPage } from '../types';
import { HubPagePicker } from './HubPagePicker';

export function HubEditor({onClose,onSaved}:{onClose:()=>void;onSaved:()=>Promise<void>}) {
  const resource=useResource<HubEditorView>('/api/hub/configuration');
  const pages=useResource<{items:HubPage[]}>('/api/hub/pages');
  return <RequestState loading={resource.loading||pages.loading} error={resource.error||pages.error} retry={()=>{void resource.reload();void pages.reload();}}>
    {resource.data&&pages.data ? <LoadedEditor key={resource.data.revisionId??'initial'} data={resource.data} pages={pages.data.items} onClose={onClose} onSaved={onSaved}/> : null}
  </RequestState>;
}

function LoadedEditor({data,pages,onClose,onSaved}:{data:HubEditorView;pages:HubPage[];onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [selection,setSelection]=useState(data.configuration);
  function choose(field:keyof Pick<HubConfiguration,'linkPageIds'|'announcementPageIds'|'keyPageIds'>,ids:string[]) { setSelection(previous=>({...previous,[field]:ids})); }
  return <ActionDialog title="Edit company hub" action="Save company hub" onClose={onClose} onSubmit={async form=>{
    await mutate('/api/hub',{operationKey:operationKey(),expectedRevisionId:data.revisionId,configuration:{...selection,title:String(form.get('title')??''),description:String(form.get('description')??'')}},'PUT');
    await onSaved();
  }}>
    <p>Everyone in the workspace sees this hub on Home. Each person sees only links and posts they can read.</p>
    <label>Hub title<input name="title" defaultValue={data.configuration.title} required maxLength={200}/></label>
    <label>Welcome message<textarea name="description" defaultValue={data.configuration.description} maxLength={4000} rows={3}/></label>
    {data.unavailableSelections ? <p role="status">Some earlier selections are no longer available with your access. Saving replaces the hub with the selections shown here.</p> : null}
    <HubPagePicker label="Quick links" pages={pages} selected={selection.linkPageIds} onChange={ids=>choose('linkPageIds',ids)}/>
    <HubPagePicker label="Announcements" pages={pages.filter(page=>page.isPost)} selected={selection.announcementPageIds} onChange={ids=>choose('announcementPageIds',ids)} ordered={false}/>
    <p className="muted">Announcements are published blog posts, shown newest first. Write new posts from a space’s Blog tab, then choose them here.</p>
    <HubPagePicker label="Key pages" pages={pages} selected={selection.keyPageIds} onChange={ids=>choose('keyPageIds',ids)}/>
    <p className="muted">Key pages appear only while their current content is verified. A changed or lapsed page returns after it is verified again.</p>
  </ActionDialog>;
}
