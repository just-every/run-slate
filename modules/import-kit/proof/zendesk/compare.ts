import { canonicalJson } from '../../src/index.ts';
export function normalizeTables(tables:any,importTime:string) {
  const replace=(value:any):any=>typeof value==='string'&&value===importTime?'$IMPORT_TIME':Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):value;
  return Object.fromEntries(Object.entries(tables).map(([name,rows]:any)=>[name,rows.map(replace).sort((a:any,b:any)=>canonicalJson(a).localeCompare(canonicalJson(b)))]));
}
export function outcomeCounts(outcomes:any[]) {
  const byKind:any={}; const byOutcome:any={};
  for(const o of outcomes){byKind[o.type]=(byKind[o.type]??0)+1;byOutcome[o.outcome]=(byOutcome[o.outcome]??0)+1;}
  return {total:outcomes.length,byKind,byOutcome};
}
export function differences(left:any,right:any) {
  return [...new Set([...Object.keys(left),...Object.keys(right)])].filter(key=>canonicalJson(left[key]??null)!==canonicalJson(right[key]??null));
}
