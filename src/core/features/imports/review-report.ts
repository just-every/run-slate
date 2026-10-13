import type {NativeUnit} from './native-plan';
import type {NormalizedImport,ImportReportEntry,ImportReportEntryKind} from './types';
import type {PrincipalMapping} from './principal-mapping';

/** Physical native rows are the creation ledger. Source counts remain separate
 * because backing pages, initial snapshots and per-page media copies are real. */
export function nativeCreationReport(units:NativeUnit[],parsed:NormalizedImport) {
 const originals=new Map(parsed.report.created.filter(item=>item.targetId).map(item=>[item.targetId,item]));
 const titles=new Map(units.flatMap(unit=>unit.rows.filter(row=>row.table==='pages').map(row=>[String(row.values.id),String(row.values.title)] as const)));
 const tables:Record<string,{kind:ImportReportEntryKind;count:string}>= {containers:{kind:'container',count:'containers'},pages:{kind:'page',count:'pages'},databases:{kind:'database',count:'databases'},database_records:{kind:'record',count:'records'},files:{kind:'file',count:'files'},page_revisions:{kind:'version',count:'versions'}};
 const created:ImportReportEntry[]=[],counts:Record<string,number>={containers:0,pages:0,databases:0,records:0,files:0,versions:0},physicalRows:Record<string,number>={};
 for(const unit of units)for(const row of unit.rows){
  physicalRows[row.table]=(physicalRows[row.table]??0)+1;
  const category=tables[row.table];if(!category)continue;
  counts[category.count]=(counts[category.count]??0)+1;const id=String(row.values.id??row.values.page_id),original=originals.get(id);
  created.push({...original,kind:category.kind,targetId:id,label:String(row.values.title??row.values.original_name??row.values.name??original?.label??titles.get(String(row.values.page_id))??id)});
 }
 return {created,counts,physicalRows,sourceCounts:{pages:parsed.pages.length,databases:parsed.databases.length,records:parsed.records.length,files:parsed.media.length,versions:parsed.pages.reduce((count,page)=>count+page.revisions.length,0)}};
}
export function restrictionReport(parsed:NormalizedImport,mappings:PrincipalMapping[]) {
 const mapped=new Set(mappings.map(item=>`${item.kind}:${item.sourceId}`));
 let restrictedPages=0,sourceNamedGrants=0,mappedLiveGrants=0,unresolvedRestrictedPages=0;
 for(const page of parsed.pages){
  const named=page.grants.filter(grant=>!grant.general);
  const restricted=page.restricted||named.length>0;if(!restricted)continue;
  restrictedPages++;sourceNamedGrants+=named.length;
  const live=named.filter(grant=>mapped.has(`${grant.principalKind}:${grant.principalSourceId}`));mappedLiveGrants+=live.length;
  if(live.length!==named.length||named.length===0){
   unresolvedRestrictedPages++;
   parsed.report.unmapped.push({kind:'page',sourceId:page.sourceId,label:page.title,detail:'Some source restrictions have no reviewed active principal mapping. Unmapped principals remain historical; the importing member retains recovery access. Restriction inheritance stays closed.'});
  }
 }
 if(parsed.format==='confluence-space'&&parsed.pages.some(page=>page.grants.some(grant=>!grant.general&&grant.level==='edit')))parsed.report.warnings.push({kind:'construct',label:'Source edit restrictions',detail:'Source edit restrictions conservatively close native page inheritance. Explicitly mapped members or groups receive the source edit grant; the importing member retains recovery access.'});
 return {restrictedPages,sourceNamedGrants,mappedLiveGrants,unresolvedRestrictedPages,recoveryGrants:restrictedPages};
}
