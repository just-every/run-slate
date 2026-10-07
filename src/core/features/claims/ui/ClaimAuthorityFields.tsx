import {useState} from 'react';
import {useResource} from '../../../client/useResource';
import {errorMessage} from '../../../client/transport';
import type {ClaimRecord} from '../contracts';

type Decision = {id:string;revision_id:string;question:string};
export function authorityFromForm(form:FormData):ClaimRecord['authority']{
 const value=String(form.get('authorityDecision')??'');
 if(!value)return {kind:'none'};
 const [decisionId,revisionId]=JSON.parse(value) as [string,string];
 return {kind:'accepted-decision',decisionId,revisionId,applicability:String(form.get('applicability')??'').trim(),delegatedOffice:String(form.get('delegatedOffice')??'').trim()||null};
}
export function ClaimAuthorityFields({claim}:{claim:ClaimRecord}){
 const decisions=useResource<{items:Decision[]}>('/api/decisions?state=accepted');
 const authority=claim.authority;
 const initial=authority.kind==='accepted-decision'?JSON.stringify([authority.decisionId,authority.revisionId]):'';
 const [selected,setSelected]=useState(initial);
 return <fieldset><legend>Recorded authority</legend>
  <p>Choose an exact accepted decision only when it applies. Recording it does not grant permission to act or establish a commercial entitlement.</p>
  <label>Accepted decision<select aria-label="Accepted decision" name="authorityDecision" value={selected} onChange={event=>setSelected(event.target.value)}>
   <option value="">No authority established</option>
   {selected&&!decisions.data?.items.some(d=>JSON.stringify([d.id,d.revision_id])===selected)?<option value={selected}>Previously recorded decision (revalidated on save)</option>:null}
   {decisions.data?.items.map(d=><option key={d.id} value={JSON.stringify([d.id,d.revision_id])}>{d.question}</option>)}
  </select></label><button className="native-effect-adjust" type="button" onClick={decisions.reload}>Refresh accepted decisions</button>
  <label>Authority applies to<textarea aria-label="Authority applies to" name="applicability" defaultValue={authority.kind==='accepted-decision'?authority.applicability:''}/></label>
  <label>Delegated office<input name="delegatedOffice" defaultValue={authority.kind==='accepted-decision'?authority.delegatedOffice??'':''} placeholder="Not established"/></label>
  {decisions.error?<p role="alert">{errorMessage(decisions.error)}</p>:null}
 </fieldset>;
}
