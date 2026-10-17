import type { FeatureContext } from '../../app/feature-context';
import { createUlid } from '../../shared/ulid';
import { implicitWatchStatement } from '../navigation/watches';
import { notificationStatements, type NotificationEvent } from './events';
/** Five minutes without a save ends this author's editing session on this page. */
export const watchEditingWindowMs=5*60*1000;
const edits=new Set(['properties','block','structure','record-properties','restored','status']);
const events:Record<string,NotificationEvent>={created:'page-created',moved:'page-moved',archive:'page-archived',trash:'page-trashed',restore:'page-restored'};
export function watchedChangeStatements(ctx:FeatureContext,pageId:string,kind:string,containerIds:string[]=[]):D1PreparedStatement[] {
 if(ctx.contentOrigin==='historical-import')return [];
 const editing=edits.has(kind),event=editing?'page-edited':events[kind];
 if(!event)return [];
 const id=createUlid(),statements:D1PreparedStatement[]=[];
 if(editing||kind==='created')statements.push(implicitWatchStatement(ctx,pageId));
 if(editing)statements.push(ctx.db.prepare(`INSERT INTO watch_edit_sessions(page_id,actor_member_id,session_id,last_edit_at) VALUES(?,?,?,?)
 ON CONFLICT(page_id,actor_member_id) DO UPDATE SET
 session_id=CASE WHEN watch_edit_sessions.last_edit_at<=? THEN excluded.session_id ELSE watch_edit_sessions.session_id END,
 last_edit_at=MAX(watch_edit_sessions.last_edit_at,excluded.last_edit_at)`).bind(pageId,ctx.actor.id,id,ctx.now,new Date(Date.parse(ctx.now)-watchEditingWindowMs).toISOString()));
 statements.push(...notificationStatements(ctx,{id:`watch:${id}`,event,pageId},{containerIds,editingSession:editing}));
 return statements;
}
