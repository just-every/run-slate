import {useState} from 'react';
import {ActionDialog} from '../../../../app/ui/ActionDialog';
import {mutate,operationKey} from '../../../../client/transport';
import type {DocumentView} from '../../../../client/content';
import {displayDate} from '../../../../app/ui/displayDate';

export function PageReviewDate({document,revision,reload}:{document:DocumentView;revision:string;reload:()=>void|Promise<void>}) {
 const [editing,setEditing]=useState(false),date=document.properties?.reviewDate;
 return <section aria-label="Review date"><h3>Review date</h3>
  <p>{date?<time dateTime={date}>{displayDate(date)}</time>:'No review date set.'}</p>
  {document.permissions.canEdit?<button type="button" onClick={()=>setEditing(true)}>Change review date</button>:null}
  {editing?<ActionDialog title="Change review date" action="Save review date" onClose={()=>setEditing(false)} onSubmit={async data=>{
   await mutate(`/api/pages/${document.page.id}`,{operationKey:operationKey(),expectedRevisionId:revision,properties:{reviewDate:String(data.get('reviewDate'))||null}},'PATCH');
   await reload();
  }}><label>Review date<input type="date" name="reviewDate" defaultValue={date??''}/></label><p>Clear the date to remove it. Review assignments and reminders are managed separately.</p></ActionDialog>:null}
 </section>;
}
