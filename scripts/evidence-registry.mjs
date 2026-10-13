import path from 'node:path';
const key=(file,name)=>JSON.stringify([file,name]);
export function requirementRecords(documents){return Object.entries(documents).flatMap(([document,text])=>{const matches=[...text.matchAll(/\*\*((?:BASE-)?[A-Z]+-\d{3}) —/g)];return matches.map((match,i)=>({id:match[1],document,requirement:text.slice(match.index,matches[i+1]?.index??text.length).trim()}));});}
/** Exact registration only. Supporting checks can never satisfy a clause. */
export function validateEvidenceRegistry({root,report,registry,inventory,documents}){
 const errors=[],registered=new Map(),observed=new Set(),requirements=requirementRecords(documents),ids=new Set(requirements.map(x=>x.id)),records=new Map();
 for(const file of report.testResults??[])for(const assertion of file.assertionResults??[])observed.add(key(path.relative(root,file.name),assertion.fullName??assertion.title??''));
 if(registry.version!==1||inventory.version!==1)errors.push('Unsupported evidence metadata version');
 for(const entry of registry.entries??[]){const identity=key(entry.file,entry.testName);if(registered.has(identity))errors.push('Duplicate test entry: '+identity);if(!observed.has(identity))errors.push('Stale or unknown test entry: '+identity);if(entry.kind!=='supporting-regression'||!entry.reason?.trim()||!Array.isArray(entry.clauses))errors.push('Invalid supporting evidence: '+identity);for(const id of entry.clauses??[])if(!ids.has(id))errors.push('Unknown clause '+id);registered.set(identity,entry);}
 for(const entry of inventory.clauses??[]){if(records.has(entry.id))errors.push('Duplicate clause '+entry.id);records.set(entry.id,entry);if(!ids.has(entry.id))errors.push('Unknown clause inventory '+entry.id);if(entry.status!=='unproven'||!entry.unmetReason?.trim())errors.push('Missing unmet reason '+entry.id);for(const ref of entry.supportingTests??[]){const test=registered.get(key(ref.file,ref.testName));if(!test?.clauses.includes(entry.id))errors.push('Stale clause support '+entry.id+': '+key(ref.file,ref.testName));}}
 for(const expected of requirements){const actual=records.get(expected.id);if(!actual||actual.document!==expected.document)errors.push('Missing requirement '+expected.id);else records.set(expected.id,{...actual,requirement:expected.requirement});}
 return {errors,records,registered,isSupporting:(file,name)=>registered.has(key(path.relative(root,file),name))};
}

/** Raw clause tags establish test inventory only; never confuse this with acceptance. */
export function taggedTestInventory(report){
 const ids=new Set();
 for(const file of report.testResults??[])for(const assertion of file.assertionResults??[]){
  const match=/^((?:BASE-)?[A-Z]+-\d{3})(?:\s+\[[^\]]+\])?\s+—\s+/.exec(assertion.fullName??assertion.title??'');
  if(match)ids.add(match[1]);
 }
 return ids;
}
