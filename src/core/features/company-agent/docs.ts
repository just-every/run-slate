import type {AppBindings} from '../../app/types';
import type {DocsPageData} from '../docs/types';
import {nativeTools,nativeNotTools} from './catalogue';
import {nativeResources} from './resources';
import {eventsTool} from '../../../../modules/agent-door/events.ts';
import type {Runtime} from '../../../../modules/agent-door/index.ts';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Descriptions are generated from the production definitions, without opening
 * a database, evaluating a classifier or disclosing an installation binding. */
export function agentDocs():DocsPageData {
 const tools=[...nativeTools({} as AppBindings),eventsTool({options:{seed:'slate'}} as Runtime)].sort((a,b)=>a.name.localeCompare(b.name));
 const section=(id:string,title:string)=>`<h2 id="${id}">${title}</h2>`;
 const list=(items:string[])=>'<ul>'+items.map(value=>'<li><code>'+escape(value)+'</code></li>').join('')+'</ul>';
 return {slug:'agents',source:'docs/agent-access.md',title:'Company agent access',titleId:'company-agent-access',description:'The wiki curator’s native tools, scopes, records and current limits.',toc:[{depth:2,id:'supported-jobs',text:'Supported jobs'},{depth:2,id:'records',text:'Records'},{depth:2,id:'policy-and-limits',text:'Policy and limits'},{depth:2,id:'boundaries',text:'Other doors and screens'}],html:
  `<p>The wiki curator reads and updates permitted native wiki records through <code>/mcp</code>. Each call uses the sponsor’s current native permissions and the company’s signed policy. Imported and wiki content is untrusted data.</p><p>This adoption is in progress. The tools below are connected; the wider target table in the contract is not an availability claim.</p>`+
  section('supported-jobs','Supported jobs')+tools.map(tool=>`<h3>${escape(tool.title)}</h3><p><code>${escape(tool.name)}</code> — ${escape(tool.description)}</p><dl><dt>Scope</dt><dd><code>${escape(tool.scope)}</code></dd><dt>Possible classes</dt><dd>${tool.classes.map(escape).join(', ')}</dd><dt>Contract</dt><dd>${tool.clauses.map(escape).join(', ')}</dd><dt>Computed-class proof</dt><dd>${tool.classes.map(cls=>`<code>${escape(tool.name.slice(6).replaceAll('.','_')+'_'+cls)}</code>`).join(', ')} in the native conformance journey</dd></dl>`).join('')+
  section('records','Records')+list(nativeResources({} as AppBindings).map(resource=>resource.uriTemplate))+`<p>Native grants and field visibility apply. Missing and restricted records have the same response. Source, inquiry and run records require the flagship profile. Reads pass through policy, approval and audit.</p>`+
  section('policy-and-limits','Policy and limits')+`<p>The intended CORE families are tools, policy, pause, audit and idempotency. Principal authorization and owner-bound tokens always apply. No optional family is declared: events, subscriptions, multi-sponsor, mail edges, resource refresh, timed lifecycle, dual host, queued lifecycle or owner-native administration.</p><p>The pinned runtime adds <code>slate.events.list</code>; native record events are not yet declared. No provider spend enforcement is claimed. The door admits 600 requests per minute and a 1 MiB body. Native request and content limits still apply.</p><p>Stable refusals include <code>policy_unset</code>, <code>policy_blocked</code>, <code>agents_paused</code>, <code>business_paused</code>, <code>insufficient_scope</code>, <code>self_escalation</code>, <code>idempotency_conflict</code> and <code>revision_conflict</code>, together with the native action’s error code. Company approval cannot widen native grants or stand in for a person’s authentication.</p>`+
  section('boundaries','Other doors and screens')+list(nativeNotTools.map(row=>`${row.clauses.join(', ')}: ${row.reason}`))};
}
