import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {mutate,operationKey} from '../../../../client/transport';
import {useWorkspace} from '../../../../app/ui/WorkspaceContext';
import {RequestState} from '../../../../app/ui/RequestState';
import {ActionDialog} from '../../../../app/ui/ActionDialog';
import type {FieldDto} from '../../../../client/records';
import {formFieldTypes,type FormDefinition} from '../../forms/definition';
import {FormQuestion} from './FormQuestion';
interface FormView {id:string;title:string;definition:FormDefinition;published:boolean;revisionId:string;href:string}
export function DatabaseForms({databaseId,title,fields,canEdit}:{databaseId:string;title:string;fields:FieldDto[];canEdit:boolean}){
 const {member}=useWorkspace(),resource=useResource<{item:FormView|null}>(canEdit?`/api/databases/${databaseId}/form`:null);
 const guests=useResource<{items:{id:string;displayName:string}[]}>(canEdit&&member.role==='owner'?'/api/guests':null);
 const [draft,setDraft]=useState<{title:string;definition:FormDefinition;published:boolean}>();
 const available=fields.filter(f=>formFieldTypes.some(type=>type===f.type));
 const open=()=>{const prior=resource.data?.item;setDraft(prior?{title:prior.title,definition:structuredClone(prior.definition),published:prior.published}:{title:`${title} form`,definition:{members:true,anonymous:false,guestIds:[],questions:[]},published:false});};
 const definition=draft?.definition;
 return <section aria-label="Database form"><h2>Database form</h2>{!canEdit?<p>Edit access is required to manage this form.</p>:<RequestState loading={resource.loading} error={resource.error} retry={resource.reload}><p>{resource.data?.item?.published?'Published':'Not published'}. Questions create records in this database. No file uploads or computed fields are accepted.</p>{resource.data?.item?.published?<p><a href={resource.data.item.href}>Open form</a></p>:null}<button onClick={open}>Configure form</button></RequestState>}
 {draft&&definition?<ActionDialog title="Configure database form" action="Save form" onClose={()=>setDraft(undefined)} onSubmit={async()=>{await mutate(`/api/databases/${databaseId}/form`,{operationKey:operationKey(),expectedRevisionId:resource.data?.item?.revisionId??null,...draft},'PUT');await resource.reload();}}><div className="detail-form">
 <label>Form title<input required maxLength={200} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
 <fieldset><legend>Who may submit</legend><label><input type="checkbox" checked={definition.members} onChange={e=>setDraft({...draft,definition:{...definition,members:e.target.checked}})}/>Members</label><label><input type="checkbox" checked={definition.anonymous} onChange={e=>setDraft({...draft,definition:{...definition,anonymous:e.target.checked}})}/>Anonymous link</label><p>Anonymous access requires public links and anonymous access to remain allowed in the space.</p>{member.role==='owner'?<label>Named guests<select multiple size={3} value={definition.guestIds} onChange={e=>setDraft({...draft,definition:{...definition,guestIds:[...e.target.selectedOptions].map(o=>o.value)}})}>{guests.data?.items.map(guest=><option key={guest.id} value={guest.id}>{guest.displayName}</option>)}</select></label>:<p>A workspace owner can select named guests from the guest directory.</p>}</fieldset>
 <fieldset><legend>Questions</legend><p>Record title is always required. Select additional fields below.</p>{available.map(field=><label key={field.id}><input type="checkbox" checked={definition.questions.some(q=>q.fieldId===field.id)} onChange={e=>{const questions=e.target.checked?[...definition.questions,{fieldId:field.id,label:field.name,help:'',required:false,when:null}]:definition.questions.filter(q=>q.fieldId!==field.id).map(q=>q.when?.fieldId===field.id?{...q,when:null}:q);setDraft({...draft,definition:{...definition,questions}});}}/>Include {field.name}</label>)}</fieldset>
 {definition.questions.map((question,index)=><FormQuestion key={question.fieldId} question={question} fields={fields} earlier={definition.questions.slice(0,index)} onChange={q=>setDraft({...draft,definition:{...definition,questions:definition.questions.map(item=>item.fieldId===q.fieldId?q:item)}})}/>)}
 <label><input type="checkbox" checked={draft.published} onChange={e=>setDraft({...draft,published:e.target.checked})}/>Publish form</label><p>Anonymous submissions have no stored submitter identity. Named submissions retain the member’s identity. Address limits and the spam check stay on.</p></div></ActionDialog>:null}</section>;
}
