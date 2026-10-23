import {zipSync,strToU8} from 'fflate';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {resolveEvidence} from '../ai/evidence';
import {requireSkillRevisionDisclosure,readSkill} from './disclosure';
import {bodyReferencesFile,propertyReferencesFile} from '../media/references';
import type {PageProperties} from '../pages/types';
import type {BlockView} from '../../shared/api/content';
/** A labelled immutable handoff, without live authority or implicit synchronization. */
export async function exportSkillSnapshot(ctx:FeatureContext,revisionId:string){
 const definition=await requireSkillRevisionDisclosure(ctx,revisionId),packets=await resolveEvidence(ctx,definition.refs,[ctx.actor.id]);
 const row=await ctx.db.prepare('SELECT s.id,s.name,s.owner_id,v.state,v.created_at FROM intelligence_skills s JOIN intelligence_skill_versions v ON v.skill_id=s.id WHERE v.id=? AND s.workspace_id=?').bind(revisionId,ctx.actor.workspaceId).first<{id:string;name:string;owner_id:string;state:string;created_at:string}>();
 if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 await readSkill(ctx,row.id);
 const snapshot={skillId:row.id,revisionId,ownerId:row.owner_id,createdAt:row.created_at,exportedAt:ctx.now,stateAtExport:row.state,executionAuthority:false,synchronization:'none',definition};
 const section=(label:string,values:string[])=>`## ${label}\n\n${values.map(value=>`- ${value}`).join('\n')||'None.'}\n`;
 const markdown=`# ${row.name}\n\nLabelled snapshot of ${row.id} at immutable revision ${revisionId}.\nExported ${ctx.now}; no live synchronization or execution authority is conveyed.\n\n## Instructions\n\n${definition.instructions}\n\n${section('Preconditions',definition.preconditions)}\n${section('Allowed semantic tools',definition.tools)}\n${section('Exact effects and targets',definition.effects)}\n${section('Success checks',definition.successTests)}\n${section('Escalations',definition.escalations)}\nBudget: ${definition.maxCostMicros} micro-units.\n\nExact source references and permitted evidence are attached. Recheck current authority before use.\n`;
 const entries:Record<string,Uint8Array>={'SKILL.md':strToU8(markdown),'snapshot.json':strToU8(JSON.stringify(snapshot,null,2))};
 let size=0;for(const packet of packets){const data=strToU8(JSON.stringify(packet,null,2));size+=data.length;entries[`sources/${packet.id}.json`]=data;}
 const attachments:{id:string;pageId:string;name:string;contentType:string;entry:string}[]=[];for(const packet of packets){
  if(packet.ref.kind!=='page')continue;
  // Only files the exact cited snapshot shows this reader travel with it, as the media door allows.
  const pageId=packet.ref.sourceId,{body,properties}=JSON.parse(packet.text) as {body:BlockView[];properties:PageProperties};
  const files=(await ctx.db.prepare('SELECT id,original_name AS name,storage_key,content_type FROM files WHERE page_id=? AND deleted_at IS NULL').bind(pageId).all<{id:string;name:string;storage_key:string;content_type:string}>()).results;
  for(const file of files){if(attachments.some(attachment=>attachment.id===file.id)||properties.coverFileId!==file.id&&properties.icon!==`file:${file.id}`&&!bodyReferencesFile(body,file.id)&&!await propertyReferencesFile(ctx,pageId,properties,file.id))continue;const object=await ctx.files.get(file.storage_key);if(!object)throw new ApiProblem(409,'MISSING_EXPORT_FILE','A referenced original file is missing.');const bytes=new Uint8Array(await object.arrayBuffer());size+=bytes.length;if(size>64*1024*1024)throw new ApiProblem(413,'ARCHIVE_TOO_LARGE','Skill snapshot attachments exceed 64 MiB.');const entry=`attachments/${attachments.length}`;entries[entry]=bytes;attachments.push({id:file.id,pageId,name:file.name,contentType:file.content_type,entry});}
 }
 entries['attachments.json']=strToU8(JSON.stringify(attachments,null,2));
 // Access can change during R2 reads; resolve the full closure again before disclosure.
 await requireSkillRevisionDisclosure(ctx,revisionId);
 return {filename:`skill-${row.id}-${revisionId}.zip`,bytes:zipSync(entries,{level:1})};
}
