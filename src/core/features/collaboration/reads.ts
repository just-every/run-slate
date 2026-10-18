import { personDisplayName, personInitials } from '../../shared/person-identity';
import type {FeatureContext} from '../../app/feature-context';
import type {readPage} from '../pages/service';
type Document=Awaited<ReturnType<typeof readPage>>;
interface Presence {id:string;displayName:string;email:string;sessionId:string;cursorJson:string}
export function collaborationReads(ctx:FeatureContext,pageId:string,after=0):D1PreparedStatement[] {
  return [
    ctx.db.prepare('SELECT sequence,revision_id AS revisionId,kind FROM content_events WHERE page_id=? AND sequence>? ORDER BY sequence LIMIT 1000').bind(pageId,after),
    ctx.db.prepare("SELECT m.id,m.display_name AS displayName,m.email,p.session_id AS sessionId,p.cursor_json AS cursorJson FROM content_presence p JOIN members m ON m.id=p.member_id WHERE p.page_id=? AND p.expires_at>? AND m.status='active'").bind(pageId,ctx.now)
  ];
}
export function collaborationResult(document:Document,rows:D1Result[]) {
  return {document,events:rows[0].results,presence:(rows[1].results as Presence[]).map(({cursorJson,email,...person})=>({...person,displayName:personDisplayName(person.displayName,email),initials:personInitials(person.displayName,email),cursor:JSON.parse(cursorJson??'null')}))};
}
