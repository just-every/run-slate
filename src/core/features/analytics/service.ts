import { requiredId } from '../navigation/request';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { currentSubject,requireContainerLevel,requirePageLevel } from '../sharing/current-access';
import { permitted } from '../search/visibility';
import { personalMutation } from '../navigation/mutations';
import { createUlid } from '../../shared/ulid';
export async function pageOpenStatements(ctx:FeatureContext,pageId:string):Promise<D1PreparedStatement[]> {
 const page=await ctx.db.prepare('SELECT container_id,author_member_id,lifecycle,trashed_at FROM pages WHERE id=?').bind(pageId).first<{container_id:string;author_member_id:string;lifecycle:string;trashed_at:string|null}>();if(!page||page.trashed_at)throw new ApiProblem(404,'NOT_FOUND','Not found.');const subject=await currentSubject(ctx);
 return [ctx.db.prepare('INSERT INTO recent_pages(member_id,page_id,opened_at) VALUES(?,?,?) ON CONFLICT(member_id,page_id) DO UPDATE SET opened_at=excluded.opened_at').bind(ctx.actor.id,pageId,ctx.now),...(page.lifecycle==='draft'?[]:[ctx.db.prepare('INSERT INTO page_views(id,workspace_id,page_id,container_id,viewer_member_id,viewer_kind,is_own_page,viewed_at) VALUES(?,?,?,?,?,?,?,?)').bind(createUlid(),ctx.actor.workspaceId,pageId,page.container_id,ctx.actor.id,subject.isGuest?'guest':'member',page.author_member_id===ctx.actor.id?1:0,ctx.now)])];
}
export function recordView(ctx:FeatureContext,input:{operationKey:string;pageId:string}) {requiredId(input.pageId);return personalMutation(ctx,{operationKey:input.operationKey,action:'recent.view',request:input,authorize:()=>requirePageLevel(ctx,input.pageId,'view').then(()=>{}),build:async()=>({statements:await pageOpenStatements(ctx,input.pageId),value:{pageId:input.pageId,viewedAt:ctx.now}})});}
export async function analytics(ctx:FeatureContext,input:{pageId?:string;containerId?:string;from?:string;to?:string}) {
 if(!!input.pageId===!!input.containerId)throw new ApiProblem(400,'INVALID_SCOPE','Supply one page or container.');
 const normalize=(value:string|undefined)=>{if(!value)return null;const time=Date.parse(value);if(!Number.isFinite(time))throw new ApiProblem(400,'INVALID_DATE','Invalid analytics date.');return new Date(time).toISOString();};
 const from=normalize(input.from),to=normalize(input.to);
 if(from&&to&&from>to)throw new ApiProblem(400,'INVALID_DATE_RANGE','From must be on or before Until.');
 await currentSubject(ctx);if(input.pageId)await requirePageLevel(ctx,input.pageId,'view');else await requireContainerLevel(ctx,input.containerId!,'view');
 const pages=await ctx.db.prepare("SELECT id FROM pages WHERE workspace_id=? AND (? IS NULL OR id=?) AND (? IS NULL OR container_id=?) AND deleted_at IS NULL AND trashed_at IS NULL AND lifecycle<>'draft'").bind(ctx.actor.workspaceId,input.pageId??null,input.pageId??null,input.containerId??null,input.containerId??null).all<{id:string}>();
 const readable=new Set<string>();for(const p of pages.results)if(await permitted(()=>requirePageLevel(ctx,p.id,'view')))readable.add(p.id);
 const rows=await ctx.db.prepare('SELECT v.page_id,v.viewer_member_id,v.viewer_kind,v.is_own_page,v.viewed_at,m.display_name,m.status,m.member_kind FROM page_views v LEFT JOIN members m ON m.id=v.viewer_member_id WHERE v.workspace_id=? AND (? IS NULL OR v.viewed_at>=?) AND (? IS NULL OR v.viewed_at<=?) ORDER BY v.viewed_at').bind(ctx.actor.workspaceId,from,from,to,to).all<{page_id:string;viewer_member_id:string|null;viewer_kind:string;is_own_page:number;viewed_at:string;display_name:string|null;status:string|null;member_kind:string|null}>();
 const subject=await currentSubject(ctx);const visible=rows.results.filter(r=>readable.has(r.page_id));const unique=new Set<string>();const viewers=new Map<string,{id:string;displayName:string;views:number;ownPageViews:number}>();const byDay=new Map<string,{day:string;views:number;ownPageViews:number;uniqueViewers:number}>();const dayPeople=new Map<string,Set<string>>();
 for(const row of visible){const day=row.viewed_at.slice(0,10),bucket=byDay.get(day)??{day,views:0,ownPageViews:0,uniqueViewers:0};bucket.views++;bucket.ownPageViews+=row.is_own_page;byDay.set(day,bucket);if(row.viewer_member_id){unique.add(row.viewer_member_id);const people=dayPeople.get(day)??new Set<string>();people.add(row.viewer_member_id);dayPeople.set(day,people);bucket.uniqueViewers=people.size;}
  // Guests see only themselves; members see active workspace members, never private guest identities.
  if(row.viewer_member_id&&row.status==='active'&&(row.viewer_member_id===ctx.actor.id||!subject.isGuest&&row.member_kind==='member')){const person=viewers.get(row.viewer_member_id)??{id:row.viewer_member_id,displayName:row.display_name??'',views:0,ownPageViews:0};person.views++;person.ownPageViews+=row.is_own_page;viewers.set(person.id,person);}
 }
 const contributors=await ctx.db.prepare("SELECT pc.page_id,m.id,m.display_name AS displayName FROM (SELECT page_id,member_id FROM page_contributors UNION SELECT page_id,author_member_id AS member_id FROM page_revisions WHERE deleted_at IS NULL) pc JOIN members m ON m.id=pc.member_id WHERE m.workspace_id=? AND m.status='active' AND (m.id=? OR (?=0 AND m.member_kind='member'))").bind(ctx.actor.workspaceId,ctx.actor.id,subject.isGuest?1:0).all<{page_id:string;id:string;displayName:string}>();
 return {totalViews:visible.length,uniqueViewers:unique.size,anonymousViews:visible.filter(r=>r.viewer_kind==='anonymous').length,ownPageViews:visible.reduce((n,r)=>n+r.is_own_page,0),overTime:[...byDay.values()],viewers:[...viewers.values()],editors:[...new Map(contributors.results.filter(r=>readable.has(r.page_id)).map(r=>[r.id,{id:r.id,displayName:r.displayName}])).values()]};
}
