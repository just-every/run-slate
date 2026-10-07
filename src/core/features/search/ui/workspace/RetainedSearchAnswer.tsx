import {useFlagshipEnabled} from "../../../../app/ui/LaunchProfile";
import {useResource} from '../../../../client/useResource';
import {RunPanel,type RunDocument} from '../../../runs/ui/RunPanel';
/** Read the exact retained answer; opening search never starts inference. */
export function RetainedSearchAnswer({query}:{query:string}){
 const flagship=useFlagshipEnabled();
 const availability=useResource<{enabled:boolean;providerConfigured:boolean;modelPolicyConfigured:boolean}>(flagship?'/api/ai/availability':null);
 const enabled=availability.data?.enabled&&availability.data.providerConfigured&&availability.data.modelPolicyConfigured;
 const answers=useResource<{items:RunDocument[]}>(enabled?`/api/runs?question=${encodeURIComponent(query)}`:null);
 const run=answers.data?.items.find(item=>item.output?.answer&&['completed','needs-review'].includes(item.status));
 return enabled&&run?<section aria-label="Retained answer"><h2>Answer from your earlier question</h2><RunPanel id={run.id}/><a href={`/app/runs/${run.id}`}>Continue this same conversation</a></section>:null;
}
