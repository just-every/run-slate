import {useResource} from '../../../../client/useResource';
export type Refinements={containerId:string;contributorId:string;status:string;label:string;sort:string;updatedFrom:string;updatedTo:string;includeTrashed:boolean};
export const emptyRefinements:Refinements={containerId:'',contributorId:'',status:'',label:'',sort:'',updatedFrom:'',updatedTo:'',includeTrashed:false};
export function useSearchOptions() {
 const spaces=useResource<{items:{id:string;name:string}[]}>('/api/containers');const members=useResource<{items:{id:string;displayName:string}[]}>('/api/members');const statuses=useResource<{items:{key:string;label:string}[]}>('/api/status');
 return {spaces,members,statuses};
}
type SearchOptions=ReturnType<typeof useSearchOptions>;
export function SearchFilterSummary({kind,archived,value,options}:{kind:string;archived:boolean;value:Refinements;options:SearchOptions}) {
 const filters=[];
 if(kind)filters.push(({page:'Pages',record:'Records',container:'Spaces',template:'Templates','comment-thread':'Comments'} as Record<string,string>)[kind]);
 if(value.containerId)filters.push('Space: '+(options.spaces.data?.items.find(item=>item.id===value.containerId)?.name??'unavailable'));
 if(value.contributorId)filters.push('Contributor: '+(options.members.data?.items.find(item=>item.id===value.contributorId)?.displayName??'unavailable'));
 if(value.status)filters.push('Status: '+(options.statuses.data?.items.find(item=>item.key===value.status)?.label??'unavailable'));
 if(value.label)filters.push('Label: '+value.label);
 if(value.updatedFrom)filters.push('Updated from '+value.updatedFrom);
 if(value.updatedTo)filters.push('Updated until '+value.updatedTo);
 if(archived)filters.push('Including archive');
 if(value.includeTrashed)filters.push('Including trash');
 return <p className="muted search-filter-summary">Filters: {filters.join(' · ')||'None'}</p>;
}
export function SearchRefinements({value,onChange,options,activeCount=0,disabled=false}:{value:Refinements;onChange:(value:Refinements)=>void;options:SearchOptions;activeCount?:number;disabled?:boolean}) {
 const {spaces,members,statuses}=options;
 const total=activeCount+Object.entries(value).filter(([key,value])=>key!=='sort'&&value!==''&&value!==false).length;
 return <details className="search-refinements"><summary><span>Refine your search</span>{total?` (${total} active)`:""}</summary><div className="detail-form"><label>Space<select disabled={disabled} value={value.containerId} onChange={event=>onChange({...value,containerId:event.target.value})}><option value="">All accessible spaces</option>{spaces.data?.items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Contributor<select disabled={disabled} value={value.contributorId} onChange={event=>onChange({...value,contributorId:event.target.value})}><option value="">Anyone</option>{members.data?.items.map(item=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><label>Status<select disabled={disabled} value={value.status} onChange={event=>onChange({...value,status:event.target.value})}><option value="">Any status</option>{statuses.data?.items.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>Label<input disabled={disabled} value={value.label} onChange={event=>onChange({...value,label:event.target.value})} placeholder="Any label"/></label><label>Sort results<select aria-label="Sort results" disabled={disabled} value={value.sort} onChange={event=>onChange({...value,sort:event.target.value})}><option value="">Relevance</option><option value="updated">Last updated</option><option value="views">Most viewed</option></select></label><label>Updated from<input disabled={disabled} type="date" value={value.updatedFrom} onChange={event=>onChange({...value,updatedFrom:event.target.value})}/></label><label>Updated until<input disabled={disabled} type="date" value={value.updatedTo} onChange={event=>onChange({...value,updatedTo:event.target.value})}/></label><label><input disabled={disabled} type="checkbox" checked={value.includeTrashed} onChange={event=>onChange({...value,includeTrashed:event.target.checked})}/>Include trash</label><button disabled={disabled} type="button" onClick={()=>onChange(emptyRefinements)}>Clear refinements</button></div></details>;
}
