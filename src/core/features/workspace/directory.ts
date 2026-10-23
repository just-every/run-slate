import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {currentSubject,requirePageLevel} from '../sharing/current-access';
import {readPage} from '../pages/service';
import {tagKey} from './profile';
type Person={id:string;name:string;title:string;team:string;timezone:string;managerId:string|null;managerName:string|null;revisionId:string|null;tags:{tag:string;derived:boolean}[];hiddenTags:{tag:string;custom:boolean}[];pages:{owned:{id:string;title:string}[];verified:{id:string;title:string}[];frequent:{id:string;title:string}[]}};
/** Page lists and derived tags start from the viewer's immutable readable snapshots. */
async function visibleWork(ctx:FeatureContext){
 const rows=(await ctx.db.prepare('SELECT id FROM pages WHERE workspace_id=? AND deleted_at IS NULL AND trashed_at IS NULL').bind(ctx.actor.workspaceId).all<{id:string}>()).results;
 const documents:Awaited<ReturnType<typeof readPage>>[]=[];
 for(const row of rows){try{documents.push(await readPage(ctx,row.id));}catch(error){if(!(error instanceof ApiProblem)||error.status!==404)throw error;}}
 return documents;
}
async function pagePeopleIds(ctx:FeatureContext,pageId:string){
 const shared=await readPage(ctx,pageId);
 const editors=(await ctx.db.prepare('SELECT DISTINCT r.author_member_id AS id FROM page_revisions r WHERE r.page_id=? AND r.deleted_at IS NULL AND r.author_member_id IS NOT NULL AND (? OR EXISTS(SELECT 1 FROM content_published_revisions p WHERE p.page_id=r.page_id AND p.revision_id=r.id))').bind(pageId,+['edit','full'].includes(shared.permissions.level)).all<{id:string}>()).results;
 return new Set([shared.authorMemberId,shared.properties.ownerMemberId,...editors.map(c=>c.id)].filter((id):id is string=>!!id));
}
export async function peopleOnPage(ctx:FeatureContext,pageId:string){const ids=await pagePeopleIds(ctx,pageId),result=await directory(ctx,{pageId});return {...result,items:result.items.filter(person=>ids.has(person.id))};}
export async function directory(ctx:FeatureContext,{q='',pageId}:{q?:string;pageId?:string}={}){
 const subject=await currentSubject(ctx);let guestPeople:Set<string>|undefined;
 if(subject.isGuest){
  if(!pageId)throw new ApiProblem(403,'FORBIDDEN','Guests can see people only from a shared page.');
  await requirePageLevel(ctx,pageId,'view');guestPeople=await pagePeopleIds(ctx,pageId);
 }
 const people=(await ctx.db.prepare("SELECT m.id,m.display_name AS name,p.title,p.team,p.timezone,p.manager_member_id AS managerId,p.revision_id AS revisionId,manager.display_name AS managerName FROM members m LEFT JOIN member_profiles p ON p.member_id=m.id LEFT JOIN members manager ON manager.id=p.manager_member_id AND manager.status='active' WHERE m.workspace_id=? AND m.status='active' AND m.member_kind='member' ORDER BY m.display_name,m.id").bind(ctx.actor.workspaceId).all<Record<string,any>>()).results.filter(p=>!guestPeople||guestPeople.has(p.id));
 const work=await visibleWork(ctx),edits=(await ctx.db.prepare('SELECT page_id,author_member_id,COUNT(*) AS total,SUM(EXISTS(SELECT 1 FROM content_published_revisions p WHERE p.page_id=r.page_id AND p.revision_id=r.id)) AS publishedTotal FROM page_revisions r WHERE deleted_at IS NULL AND author_member_id IS NOT NULL GROUP BY page_id,author_member_id HAVING COUNT(*)>=2').all<{page_id:string;author_member_id:string;total:number;publishedTotal:number}>()).results;
 const overrides=(await ctx.db.prepare('SELECT o.* FROM member_expertise_overrides o JOIN members m ON m.id=o.member_id WHERE m.workspace_id=?').bind(ctx.actor.workspaceId).all<{member_id:string;tag_key:string;label:string;hidden:number;custom:number}>()).results;
 const items:Person[]=people.map(p=>{
  const owned=work.filter(d=>d.properties.ownerMemberId===p.id),verified=work.filter(d=>{const v=d.verification;return !!v&&typeof v==='object'&&!Array.isArray(v)&&v.current===true&&v.ownerMemberId===p.id;}),frequent=work.filter(d=>edits.some(e=>e.page_id===d.page.id&&e.author_member_id===p.id&&(['edit','full'].includes(d.permissions.level)||e.publishedTotal>=2)));
  const derived=new Map([...owned,...verified,...frequent].flatMap(d=>d.properties.labels??[]).map(tag=>[tagKey(tag),tag])),choices=overrides.filter(o=>o.member_id===p.id),hidden=new Set(choices.filter(o=>o.hidden).map(o=>o.tag_key));
  const tags=new Map([...derived].filter(([key])=>!hidden.has(key)).map(([key,tag])=>[key,{tag,derived:true}]));for(const choice of choices)if(!choice.hidden&&choice.custom)tags.set(choice.tag_key,{tag:choice.label,derived:derived.has(choice.tag_key)});
  const pages=(documents:typeof work)=>documents.map(d=>({id:d.page.id,title:d.page.title}));
  return {id:p.id,name:p.name,title:p.title??'',team:p.team??'',timezone:p.timezone??'UTC',managerId:guestPeople&&p.managerId&&!guestPeople.has(p.managerId)?null:p.managerId??null,managerName:guestPeople&&p.managerId&&!guestPeople.has(p.managerId)?null:p.managerName??null,revisionId:p.revisionId??null,tags:[...tags.values()].sort((a,b)=>a.tag.localeCompare(b.tag)),hiddenTags:p.id===ctx.actor.id?choices.filter(o=>o.hidden).map(o=>({tag:o.label,custom:!!o.custom})):[],pages:{owned:pages(owned),verified:pages(verified),frequent:pages(frequent)}};
 });
 const query=tagKey(q);return {items:items.filter(p=>!query||tagKey([p.name,p.title,p.team,...p.tags.map(t=>t.tag)].join(' ')).includes(query)),canBrowse:!subject.isGuest};
}
export async function memberProfile(ctx:FeatureContext,id:string,pageId?:string){const person=(await directory(ctx,{pageId})).items.find(p=>p.id===id);if(!person)throw new ApiProblem(404,'NOT_FOUND','Member unavailable.');return person;}
