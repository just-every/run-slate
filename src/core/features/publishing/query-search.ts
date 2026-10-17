import type {EmbeddedSearchQuery} from '../../shared/knowledge/search-definition';
import {matchesAdvancedSearch} from '../search/language';
import {retainedText} from '../search/documents';
import {verificationState} from '../page-status/state';

/** Called only for an active anonymous exposure and its immutable published snapshot. */
export async function publishedSearchMatch(db:D1Database,row:{id:string;properties_json:string;body_json:string;updated_at:string;container_id:string;container_name:string;container_key:string|null;page_kind:string;published_revision_id:string},query:EmbeddedSearchQuery,now:string) {
  const props=JSON.parse(row.properties_json);
  const people=(await db.prepare('SELECT m.id,m.display_name,m.email FROM members m WHERE m.id IN (SELECT member_id FROM page_contributors WHERE page_id=?) OR m.id=?').bind(row.id,props.ownerMemberId??null).all<{id:string;display_name:string;email:string}>()).results;
  const by=(await db.prepare('SELECT member_id FROM page_contributors WHERE page_id=?').bind(row.id).all<{member_id:string}>()).results.map(person=>person.member_id);
  const owner=people.find(person=>person.id===props.ownerMemberId);
  const attestation=await db.prepare(`SELECT v.status_key,v.revision_id,v.expires_at FROM page_verifications v WHERE v.id=(SELECT lv.id FROM page_verifications lv WHERE lv.page_id=? ORDER BY lv.created_at DESC,lv.id DESC LIMIT 1)`).bind(row.id).first<{status_key:string;revision_id:string;expires_at:string|null}>();
  const projected=attestation?verificationState(attestation,{status_key:props.statusKey??null,working_revision_id:row.published_revision_id},now):null;
  const state=projected==='current'?'verified':projected?'lapsed':'unverified';
  if(query.kind&&query.kind!==row.page_kind||query.containerId&&query.containerId!==row.container_id||query.contributorId&&!by.includes(query.contributorId)||query.label&&!props.labels?.some((label:string)=>label.toLocaleLowerCase()===query.label!.toLocaleLowerCase())||query.status&&query.status!==(state==='lapsed'?'lapsed':props.statusKey)||query.updatedFrom&&row.updated_at<query.updatedFrom||query.updatedTo&&row.updated_at>query.updatedTo)return false;
  return matchesAdvancedSearch(query.query,{
    title:props.title,text:retainedText(JSON.stringify({blocks:JSON.parse(row.body_json),fields:props.databaseFields??{}})),
    labels:props.labels??[],containers:[row.container_id,row.container_name,...(row.container_key?[row.container_key]:[])],
    contributors:people.filter(person=>by.includes(person.id)).flatMap(person=>[person.id,person.display_name,person.email]),
    owners:owner?[owner.id,owner.display_name,owner.email]:[],statuses:[state==='lapsed'?'lapsed':props.statusKey??''],
    verification:state,updatedAt:row.updated_at,kind:row.page_kind,
  });
}
