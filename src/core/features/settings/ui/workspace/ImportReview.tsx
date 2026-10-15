import {ImportReportSection} from './ImportReportSection';
import {useState} from 'react';
export interface ImportEntry {label:string;detail?:string}
export interface ImportView {
 id:string;filename?:string;state:string;counts?:Record<string,number>;progress?:{phase?:string;checkpoint?:number;total?:number};
 report?:{access?:Record<string,number>;sourceCounts?:Record<string,number>;sections?:Record<string,{count:number;pages:number}>;created?:ImportEntry[];wouldCreate?:ImportEntry[];unmapped?:ImportEntry[];warnings?:ImportEntry[];failure?:string;message?:string;fingerprint?:string;planBytes?:number;planBytesLimit?:number;capExceeded?:boolean;counts?:Record<string,number>;
 principals?:{sourceId:string;kind:'member'|'group';label:string}[];candidates?:{members:{id:string;label:string}[];groups:{id:string;label:string}[]};mappings?:PrincipalChoice[];
 undo?:{conflicts:{code:string;kind:string;targetId:string;reason:string}[]}};
}
export interface PrincipalChoice {sourceId:string;kind:'member'|'group';targetId:string}
export function ImportReview({job,pending,act}:{job:ImportView;pending:boolean;act:(action:string,body?:unknown)=>void}) {
 const [choices,setChoices]=useState<PrincipalChoice[]>(job.report?.mappings??[]);
 const reviewed=!!job.report?.fingerprint;
 const preview=reviewed&&job.state==='preview';
 const overCap=!!job.report?.capExceeded||job.report?.planBytes!==undefined&&job.report?.planBytesLimit!==undefined&&job.report.planBytes>job.report.planBytesLimit;
 const encoded=(items:PrincipalChoice[])=>JSON.stringify(items.map(({sourceId,kind,targetId})=>({sourceId,kind,targetId})).sort((a,b)=>a.sourceId.localeCompare(b.sourceId)));
 const mappingsChanged=encoded(choices)!==encoded(job.report?.mappings??[]);
 return <section className="import-review" aria-live="polite">
  <h3>Import · {job.state}</h3>
  {job.progress?.total!==undefined?<p>{job.progress.checkpoint??0} of {job.progress.total} {job.progress.phase==='media'?'attachments prepared':job.progress.phase==='indexing'?'pages indexed':'records processed'}</p>:null}
  <h4>{preview?'Would create':'Created'}</h4>
  <dl className="transfer-counts">{Object.entries(preview?job.report?.counts??{}:job.counts??{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl>
  {job.report?.access?<details><summary>Restriction and recovery access</summary><dl className="transfer-counts">{Object.entries(job.report.access).map(([key,count])=><div key={key}><dt>{({restrictedPages:'Restricted pages',sourceNamedGrants:'Source named grants',mappedLiveGrants:'Mapped live grants',unresolvedRestrictedPages:'Pages with unresolved restrictions',recoveryGrants:'Importing-member recovery grants',historicalMembers:'Inactive historical members',historicalGroups:'Unmapped historical groups'} as Record<string,string>)[key]??key}</dt><dd>{count.toLocaleString()}</dd></div>)}</dl></details>:null}
  {preview&&job.report?.planBytes!==undefined?<p>Reviewed plan: {job.report.planBytes.toLocaleString()} bytes of {job.report.planBytesLimit?.toLocaleString()}.</p>:null}
  {preview&&overCap?<p className="request-notice" role="alert">This reviewed plan exceeds the import size limit. Apply is unavailable; the original and complete review remain retained.</p>:null}
  {job.report?.failure?<p className="request-notice" role="alert">{job.report.failure}</p>:null}
  {job.report?.message?<p>{job.report.message}</p>:null}
  {(['wouldCreate','created','unmapped','warnings'] as const).map(kind=><ImportReportSection key={`${job.id}:${job.report?.fingerprint}:${job.state}:${kind}:${job.report?.sections?.[kind]?.count??0}`} id={job.id} kind={kind} label={kind==='unmapped'?'What did not cross':kind==='warnings'?'Warnings':kind==='wouldCreate'?'Planned creations':'Created entries'} initial={job.report?.[kind]??[]} section={job.report?.sections?.[kind]}/>)}
  {preview&&job.report?.principals?.length?<fieldset disabled={pending}><legend>Review access mappings</legend><p>Choose existing workspace members or groups. Unmapped people remain historical; restricted pages stay closed with importing-member recovery access.</p>{job.report.principals.map(principal=><label key={`${principal.kind}:${principal.sourceId}`}>{principal.label}<small>{principal.sourceId}</small><select value={choices.find(c=>c.sourceId===principal.sourceId&&c.kind===principal.kind)?.targetId??''} onChange={e=>setChoices(previous=>[...previous.filter(c=>c.sourceId!==principal.sourceId||c.kind!==principal.kind),...(e.target.value?[{...principal,targetId:e.target.value}]:[])])}><option value="">Leave unmapped</option>{(principal.kind==='member'?job.report!.candidates?.members:job.report!.candidates?.groups)?.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select></label>)}<button type="button" onClick={()=>act('preview',{mappings:choices})}>Review these mappings</button></fieldset>:null}
  {preview&&mappingsChanged?<p>Review the changed mappings before applying.</p>:null}
  <ImportReportSection key={`${job.id}:conflicts:${job.report?.sections?.conflicts?.count??0}`} id={job.id} kind="conflicts" label="Native changes preserved" initial={job.report?.undo?.conflicts??[]} section={job.report?.sections?.conflicts}/>
  <div className="action-row transfer-actions">
   {preview?<button className="primary-button" disabled={pending||mappingsChanged||overCap} onClick={()=>act('apply',{fingerprint:job.report?.fingerprint})}>Apply reviewed import</button>:null}
   {((reviewed&&['preparing','running','undoing'].includes(job.state))||job.state==='indexing'&&job.progress?.phase==='indexing')?<button className="secondary-button" disabled={pending} onClick={()=>act('resume')}>Resume import</button>:null}
   {reviewed&&['preparing','running','indexing','completed'].includes(job.state)?<button className="secondary-button" disabled={pending} onClick={()=>act('undo')}>Undo import</button>:null}
   {job.state==='failed'?<button className="secondary-button" disabled={pending} onClick={()=>act('run')}>Retry retained original</button>:null}
   {job.state!=='deleted'?<a className="transfer-action" href={`/api/imports/${job.id}/original`}>Download original archive</a>:null}
   {job.state==='completed'?<a className="transfer-action" href="/app/search">Find imported pages</a>:null}
  </div>
 </section>;
}
