import { plainContent } from '../editor/validation';
import { labelPageMentions } from '../pages/mention-labels';
export const supportedHeaderControls=['search','breadcrumbs','duplicate'];
/** Header discovery is limited to independently published anonymous-readable snapshots. */
export async function publicHeader(db:D1Database,exposure:Record<string,any>,query='') {
 const controls=JSON.parse(exposure.header_controls_json??'[]') as string[];
 const q=controls.includes('search')?query.trim().slice(0,200):'';
 if(!controls.includes('breadcrumbs')&&!q)return{...exposure,searchQuery:q,breadcrumbs:[],searchResults:[]};
 const rows=(await db.prepare("SELECT p.id,p.parent_page_id,r.properties_json,r.body_json,e.slug FROM pages p JOIN public_exposures e ON e.page_id=p.id JOIN page_revisions r ON r.id=p.published_revision_id JOIN containers c ON c.id=p.container_id JOIN workspaces w ON w.id=p.workspace_id WHERE p.workspace_id=? AND e.host=? AND e.revoked_at IS NULL AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND r.deleted_at IS NULL AND p.lifecycle IN ('live','live-with-unpublished-changes') AND c.public_link_access='allowed' AND c.anonymous_access='allowed' AND w.public_link_access='allowed' AND w.anonymous_access='allowed'").bind(exposure.workspace_id,exposure.host).all<{id:string;parent_page_id:string|null;properties_json:string;body_json:string;slug:string}>()).results;
 const link=(r:typeof rows[number])=>({title:JSON.parse(r.properties_json).title,url:`/p/${r.slug}`});
 const searchResults=q?rows.filter(r=>(String(JSON.parse(r.properties_json).title)+' '+plainContent(labelPageMentions(JSON.parse(r.body_json).map((b:any)=>b.content),()=>''))).toLocaleLowerCase().includes(q.toLocaleLowerCase())).slice(0,100).map(link):[];
 const breadcrumbs=[];const seen=new Set<string>();let parent=(await db.prepare('SELECT parent_page_id FROM pages WHERE id=?').bind(exposure.page_id).first<{parent_page_id:string|null}>())?.parent_page_id;
 while(controls.includes('breadcrumbs')&&parent&&!seen.has(parent)){seen.add(parent);const published=rows.find(r=>r.id===parent);if(published)breadcrumbs.unshift(link(published));parent=(await db.prepare('SELECT parent_page_id FROM pages WHERE id=? AND workspace_id=?').bind(parent,exposure.workspace_id).first<{parent_page_id:string|null}>())?.parent_page_id;}
 return{...exposure,searchQuery:q,breadcrumbs,searchResults};
}
