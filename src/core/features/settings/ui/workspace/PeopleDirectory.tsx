import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {useWorkspace} from '../../../../app/ui/WorkspaceContext';
import {RequestState} from '../../../../app/ui/RequestState';
import {ActionDialog} from '../../../../app/ui/ActionDialog';
import {mutate,operationKey} from '../../../../client/transport';
type Person={id:string;name:string;title:string;team:string;timezone:string;managerId:string|null;managerName:string|null;revisionId:string|null;tags:{tag:string;derived:boolean}[];hiddenTags:{tag:string;custom:boolean}[];pages:Record<'owned'|'verified'|'frequent',{id:string;title:string}[]>};
export function PeopleDirectory({pageId}:{pageId?:string}){
 const people=useResource<{items:Person[];canBrowse:boolean}>(pageId?`/api/pages/${pageId}/people`:'/api/people'),[query,setQuery]=useState(''),[selected,setSelected]=useState<string>();
 const items=people.data?.items??[],person=items.find(p=>p.id===selected),search=query.trim().toLocaleLowerCase();
 return <section aria-label={pageId?'People on this page':'People directory'}><h3>{pageId?'People on this page':'People directory'}</h3><RequestState loading={people.loading} error={people.error} retry={people.reload}>
 {person?<><button onClick={()=>setSelected(undefined)}>Back to people</button><PersonProfile person={person} people={items} onSaved={people.reload} canConfigure={!pageId}/></>:<>{!pageId?<label>Find a person or topic<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>:null}<ul className="settings-list">{items.filter(p=>!search||[p.name,p.title,p.team,...p.tags.map(t=>t.tag)].join(' ').toLocaleLowerCase().includes(search)).map(p=><li key={p.id}><div><button type="button" onClick={()=>setSelected(p.id)}>{p.name}</button><p>{[p.title,p.team].filter(Boolean).join(' · ')}</p><p>{p.tags.map(t=>t.tag).join(', ')}</p></div></li>)}</ul></>}
 </RequestState></section>;
}
function PersonProfile({person:p,people,onSaved,canConfigure}:{person:Person;people:Person[];onSaved:()=>Promise<boolean>;canConfigure:boolean}){
 const {member}=useWorkspace(),own=p.id===member.id,owner=member.role==='owner', [edit,setEdit]=useState(false);
 return <section aria-label={`${p.name} profile`}><h3>{p.name}</h3><dl><dt>Title</dt><dd>{p.title||'Not set'}</dd><dt>Team</dt><dd>{p.team||'Not set'}</dd><dt>Manager</dt><dd>{p.managerName||'Not set'}</dd><dt>Time zone</dt><dd>{p.timezone}</dd></dl>
 <h4>Expertise</h4><ul aria-label="Expertise tags">{p.tags.map(t=><li key={t.tag}>{t.tag}{t.derived?' · from page labels':''}</li>)}</ul>
 {canConfigure&&(own||owner)?<button type="button" onClick={()=>setEdit(true)}>{own?'Edit my profile':'Set team and manager'}</button>:null}
 {(['owned','verified','frequent'] as const).map(kind=><section key={kind} aria-label={kind==='owned'?'Owned pages':kind==='verified'?'Verified pages':'Frequently edited pages'}><h4>{kind==='owned'?'Owns':kind==='verified'?'Verifies':'Frequently edits'}</h4><ul>{p.pages[kind].map(page=><li key={page.id}><a href={`/app/pages/${page.id}`}>{page.title}</a></li>)}</ul>{!p.pages[kind].length?<p>No readable pages in this list.</p>:null}</section>)}
 {canConfigure&&edit?<ActionDialog title={own?'Edit my profile':`Team and manager for ${p.name}`} action="Save profile" onClose={()=>setEdit(false)} onSubmit={async data=>{
  const tags=own?[...p.tags.map(t=>({tag:t.tag,hidden:data.has(`hide:${t.tag}`),custom:!t.derived})),...p.hiddenTags.map(t=>({tag:t.tag,hidden:!data.has(`restore:${t.tag}`),custom:t.custom})),...String(data.get('tags')).split(',').map(tag=>tag.trim()).filter(Boolean).map(tag=>({tag,hidden:false,custom:true}))]:undefined;
  await mutate(`/api/people/${p.id}`,{operationKey:operationKey(),expectedRevisionId:p.revisionId,...(own?{title:String(data.get('title')),timezone:String(data.get('timezone')),tags}:{}),...(owner?{team:String(data.get('team')),managerId:String(data.get('manager'))||null}:{})},'PUT');await onSaved();
 }}>{own?<><label>Title<input name="title" defaultValue={p.title} maxLength={160}/></label><label>Time zone<input name="timezone" required defaultValue={p.timezone}/></label><fieldset><legend>Hide expertise tags</legend>{p.tags.map(t=><label key={t.tag}><input type="checkbox" name={`hide:${t.tag}`}/>Hide {t.tag}</label>)}</fieldset>{p.hiddenTags.length?<fieldset><legend>Hidden tags · visible only to you</legend>{p.hiddenTags.map(t=><label key={t.tag}><input type="checkbox" name={`restore:${t.tag}`}/>Restore {t.tag}</label>)}</fieldset>:null}<label>Add expertise, separated by commas<input name="tags"/></label></>:null}{owner?<><label>Team<input name="team" defaultValue={p.team} maxLength={160}/></label><label>Manager<select name="manager" defaultValue={p.managerId??''}><option value="">No manager</option>{people.filter(person=>person.id!==p.id).map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label></>:null}</ActionDialog>:null}
 </section>;
}
