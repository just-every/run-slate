import { displayDate } from "../../../../app/ui/displayDate";
import {useState} from 'react';
import type {DocumentView} from '../../../../client/content';
import {contentApi} from '../../../../client/content';
import {useResource} from '../../../../client/useResource';
import {mutate,operationKey} from '../../../../client/transport';
import {ActionDialog} from '../../../../app/ui/ActionDialog';
import {AnalyticsPanel} from '../../../analytics/ui/workspace/AnalyticsPanel';
import {PageStatusPanel} from '../../../page-status/ui/workspace/PageStatusPanel';
import {editorBlocks} from '../../../../client/content';
import {richTextToPlain} from '../../../editor/ui/types';
interface Details extends DocumentView {authorDisplayName:string;createdAt:string;updatedAt:string;contributors:{id:string;displayName:string}[];properties:NonNullable<DocumentView['properties']>&{ownerMemberId?:string|null;statusKey?:string|null}}
export function PageMetadata({document,revision,reload}:{document:DocumentView;revision:string;reload:()=>void}){
 const page=document as Details;
 const details=useResource<{owner:{id:string;displayName:string}|null;linkedFrom:{id:string;title:string}[];wordCount:number;readingMinutes:number}>(`/api/pages/${document.page.id}/details`);
 const members=useResource<{items:{id:string;displayName:string}[]}>('/api/members');
 const [edit,setEdit]=useState<'owner'|'labels'|null>(null);
 const text=editorBlocks(document.blocks).map(b=>'text' in b?richTextToPlain(b.text):'code'in b?b.code:'').join(' ');
 return <section><h2>Page details</h2><dl><dt>Owner</dt><dd>{details.data?.owner?.displayName??'Unassigned'}{document.permissions.canShare?<button onClick={()=>setEdit('owner')}>Reassign owner</button>:null}</dd><dt>Created by</dt><dd>{page.authorDisplayName}</dd><dt>Contributors</dt><dd>{page.contributors?.map(m=>m.displayName).join(', ')||'No other contributors'}</dd><dt>Created</dt><dd>{page.createdAt?displayDate(page.createdAt, true):''}</dd><dt>Updated</dt><dd>{page.updatedAt?displayDate(page.updatedAt, true):''}</dd><dt>Length</dt><dd>{text.trim().split(/\s+/).filter(Boolean).length} words · {text.length} characters</dd><dt>Labels</dt><dd>{page.properties?.labels?.join(', ')||'No labels'}{document.permissions.canEdit?<button onClick={()=>setEdit('labels')}>Edit labels</button>:null}</dd></dl>
 <h3>Linked from</h3><ul>{details.data?.linkedFrom.map(p=><li key={p.id}><a href={`/app/pages/${p.id}`}>{p.title}</a></li>)}</ul>
 <PageStatusPanel pageId={document.page.id} revision={revision} workingRevisionId={document.workingRevisionId} canEdit={document.permissions.canEdit} onSaved={reload}/><AnalyticsPanel pageId={document.page.id}/>
 {edit?<ActionDialog title={edit==='owner'?'Reassign owner':'Edit page labels'} action="Save details" onClose={()=>setEdit(null)} onSubmit={async data=>{await mutate(`/api/pages/${document.page.id}`,{operationKey:operationKey(),expectedRevisionId:revision,properties:edit==='owner'?{ownerMemberId:String(data.get('owner'))||null}:{labels:String(data.get('labels')).split(',').map(s=>s.trim()).filter(Boolean)}},'PATCH');await reload();}}>{edit==='owner'?<label>Owner<select name="owner" defaultValue={page.properties?.ownerMemberId??''}><option value="">Unassigned</option>{members.data?.items.map(m=><option key={m.id} value={m.id}>{m.displayName}</option>)}</select></label>:<label>Labels, separated by commas<input name="labels" defaultValue={page.properties?.labels?.join(', ')}/></label>}</ActionDialog>:null}
 </section>;
}
