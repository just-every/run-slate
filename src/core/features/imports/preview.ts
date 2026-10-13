import {normalizedNativeSource,nativeSourceMapping} from './native-source';
import {nativeCreationReport,restrictionReport} from './review-report';
import {storeReportSection,type ReportSection} from './report-store';
import {storeNormalizedSource} from './source-store';
import {nativeStreamPlanBytes} from './native-stream-size';
import {planD1ImportStream,PLAN_BYTES_LIMIT,type ImportStreamPlan} from '../../../../modules/import-kit/src/d1/index.ts';
import type {ImportRequestContext,ImportPreviewTimings} from './request-context';
import {ApiProblem} from '../../app/problems';
import {createUlid} from '../../shared/ulid';
import {mutationGuard} from '../../app/operations';
import {readRetainedZip,retainedArchiveHash} from './archive-r2';
import {parseNotionFiles} from './notion/workspace';
import {parseConfluenceFiles} from './confluence';
import {prepareImportPlan} from './persist';
import {capturePlanningContext,compileNativePlan} from './native-plan';
import {kitContext,type ImportBinding} from './kit-context';
import {mappingCandidates,sourcePrincipals,validatePrincipalMappings,type PrincipalMapping} from './principal-mapping';
import type {ImportFormat} from './types';

export interface PreviewJob extends ImportBinding {format:ImportFormat;filename:string;archive_key:string;state:string;revision_id:string;plan_key:string|null}
export interface StoredReview {stream:Pick<ImportStreamPlan,'fingerprint'>;stagedKeys:string[];pageIds:string[];containerIds:string[];sourceKey:string;planBytes?:number;archiveETag:string;archiveHash:string;mediaSources:{storageKey:string;contentType:string;sizeBytes:number;entry:import('./archive-r2').RetainedZipEntry}[]}
/** End this scope before Kit planning so parser text, block trees and captured
 * statements do not stay reachable alongside the compressed reviewed plans. */
async function prepareNativeSource(ctx:ImportRequestContext,job:PreviewJob,mappings:PrincipalMapping[],timings:ImportPreviewTimings) {
  const archiveStarted=performance.now();
  const archive=await readRetainedZip(ctx.files,job.archive_key,path=>job.format==='notion-workspace'?/\.(md|csv)$/i.test(path):!path.includes('/')&&/\.csv(?:\.gz)?$/i.test(path)||/(?:^|\/)(?:entities\.xml|exportDescriptor\.properties(?:\.gz)?)$/i.test(path));
  timings.archiveReadAdmissionMs=performance.now()-archiveStarted;
  const parseStarted=performance.now();
  const parsed=job.format==='notion-workspace'?parseNotionFiles(archive.files,{name:job.filename}):parseConfluenceFiles(archive.files,{name:job.filename});
  archive.releaseParserText();
  timings.sourceParseMs=performance.now()-parseStarted;
  // Parsing admits source structure; lazy page/revision body decoding occurs
  // inside prepareImportPlan and is therefore included in native planning.
  const planningStarted=performance.now();
  await validatePrincipalMappings(ctx,mappings,parsed);
  const capture=capturePlanningContext(ctx);
  const target=job.destination_page_id?{pageId:job.destination_page_id,expectedRevisionId:job.expected_page_revision_id!}:undefined;
  const {statements:plannedStatements,mediaSources,stagedKeys}=await prepareImportPlan(capture.ctx,job.id,parsed,target,mappings,false);
  const statements=plannedStatements.map(capture.statement);plannedStatements.length=0;
  // Complete bodies now belong to captured SQL. Keep only parser metadata used
  // by reports while transferring statements into complete native units.
  for(const page of parsed.pages){page.blocks=[];for(const revision of page.revisions)revision.blocks=[];}
  const units=await compileNativePlan(ctx,statements,true);statements.length=0;
  const creations=nativeCreationReport(units,parsed),access=restrictionReport(parsed,mappings);
  const identities={pageIds:units.filter(unit=>unit.kind==='page').map(unit=>unit.id),containerIds:units.filter(unit=>unit.kind==='container').map(unit=>unit.id),historicalMembers:units.filter(unit=>unit.kind==='member').length,historicalGroups:units.filter(unit=>unit.kind==='group').length};
  const prepared={stored:normalizedNativeSource(units,true),creations,access,principals:sourcePrincipals(parsed),unmapped:parsed.report.unmapped,warnings:parsed.report.warnings,archiveETag:archive.etag,mediaSources,stagedKeys,...identities};
  timings.nativePlanningMs=performance.now()-planningStarted;
  return prepared;
}
export async function previewImport(ctx:ImportRequestContext,job:PreviewJob,mappings:PrincipalMapping[]=[]) {
  const previewStarted=performance.now(),timings:ImportPreviewTimings={};
  ctx.previewTimings=timings;
  if(!['queued','failed','preview'].includes(job.state))throw new ApiProblem(409,'IMPORT_ALREADY_APPLIED','This import has already started.');
  const prepared=await prepareNativeSource(ctx,job,mappings,timings),{stored,creations,access}=prepared;
  {
    const source=stored.source,context=await kitContext(ctx,{...job,mapping_json:JSON.stringify(mappings)});
    const key=`federation/imports/${job.id}/review/${createUlid()}`;
    const reportKeys:string[]=[];
    await ctx.db.batch([mutationGuard(ctx.db,"SELECT revision_id=? AND state IN ('queued','failed','preview') FROM federation_imports WHERE id=?",[job.revision_id,job.id]),ctx.db.prepare("INSERT INTO import_objects(import_id,storage_key,kind,available) VALUES (?,?,'review',0),(?,?,'plan',0)").bind(job.id,key,job.id,`${key}/source`)]);
    try {
    // Retain exact custody before transferring in-memory units to Kit. A failed
    // preview removes only these new objects; the previous review stays intact.
    const custodyStarted=performance.now();
    await storeNormalizedSource(ctx.files,`${key}/source`,stored);
    timings.sourceCustodyWriteMs=performance.now()-custodyStarted;
    const kitStarted=performance.now();
    const stream=await planD1ImportStream(source,nativeSourceMapping(stored,true),context);
    timings.kitReviewPreviewMs=performance.now()-kitStarted;
    const planBytes=nativeStreamPlanBytes(stream);
    const review:StoredReview={stream:{fingerprint:stream.fingerprint},sourceKey:`${key}/source`,planBytes,archiveETag:prepared.archiveETag,archiveHash:await retainedArchiveHash(ctx.files,job.archive_key,prepared.archiveETag),mediaSources:prepared.mediaSources,stagedKeys:prepared.stagedKeys,pageIds:prepared.pageIds,containerIds:prepared.containerIds};
    await ctx.files.put(key,JSON.stringify(review),{httpMetadata:{contentType:'application/json'}});
    const sections:Record<string,ReportSection>={},items:Record<string,unknown[]>={};
    for(const [kind,entries] of Object.entries({wouldCreate:creations.created,unmapped:prepared.unmapped,warnings:prepared.warnings})){
      const stored=await storeReportSection(ctx,job.id,`${key}/report/${kind}`,entries);sections[kind]=stored.section;items[kind]=stored.first;reportKeys.push(...stored.keys);
    }
    const report={created:[],...items,sections,principals:prepared.principals,candidates:await mappingCandidates(ctx),mappings,planBytes,planBytesLimit:PLAN_BYTES_LIMIT,capExceeded:planBytes>PLAN_BYTES_LIMIT,streamPages:stream.pages.length,fingerprint:stream.fingerprint,counts:creations.counts,physicalRows:creations.physicalRows,sourceCounts:creations.sourceCounts,access:{...access,historicalMembers:prepared.historicalMembers,historicalGroups:prepared.historicalGroups},originalCustody:'Exact supplied archive retained in Slate R2. Kit artifacts describe a normalized identity/hash manifest. Complete native content is retained in canonical Kit target effects.'};
    await ctx.db.batch([ctx.db.prepare("INSERT INTO import_objects(import_id,storage_key,kind) SELECT ?,value,'report' FROM json_each(?) WHERE 1 ON CONFLICT DO NOTHING").bind(job.id,JSON.stringify(reportKeys)),ctx.db.prepare("INSERT INTO import_objects(import_id,storage_key,kind,available) SELECT ?,value,'media',0 FROM json_each(?) WHERE 1 ON CONFLICT DO NOTHING").bind(job.id,JSON.stringify(prepared.stagedKeys)),ctx.db.prepare("INSERT INTO import_objects(import_id,storage_key,kind) VALUES (?,?,'review'),(?,?,'plan') ON CONFLICT(import_id,storage_key) DO UPDATE SET available=1").bind(job.id,key,job.id,`${key}/source`),mutationGuard(ctx.db,"SELECT revision_id=? AND state IN ('queued','failed','preview') FROM federation_imports WHERE id=?",[job.revision_id,job.id]),ctx.db.prepare("UPDATE federation_imports SET state='preview',plan_key=?,report_json=?,counts_json='{}',mapping_json=?,revision_id=?,updated_at=? WHERE id=?").bind(key,JSON.stringify(report),JSON.stringify(mappings),createUlid(),ctx.now,job.id)]);
    }catch(error){await ctx.files.delete(key);await ctx.files.delete(`${key}/source`);for(const reportKey of reportKeys)await ctx.files.delete(reportKey);throw error;}
    if(job.plan_key){
      const prior=await ctx.files.get(job.plan_key);if(prior){const old=await prior.json<StoredReview>();await ctx.db.batch([ctx.db.prepare("INSERT INTO content_media_cleanup(storage_key,created_at) SELECT storage_key,? FROM import_objects WHERE import_id=? AND (storage_key=? OR substr(storage_key,1,?)=? OR storage_key IN (SELECT value FROM json_each(?))) ON CONFLICT DO NOTHING").bind(ctx.now,job.id,job.plan_key,job.plan_key.length+1,`${job.plan_key}/`,JSON.stringify(old.stagedKeys)),ctx.db.prepare('DELETE FROM import_objects WHERE import_id=? AND storage_key IN (SELECT storage_key FROM content_media_cleanup)').bind(job.id)]);}
    }
  }
  // Runtime elapsed time includes awaited I/O. Workers may report zero for
  // synchronous work because its clock need not advance between I/O events.
  timings.fullPreviewMs=performance.now()-previewStarted;
}
