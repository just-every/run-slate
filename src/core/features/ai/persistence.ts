import type { FeatureContext } from '../../app/feature-context';
import { createUlid } from '../../shared/ulid';
export function revision(ctx:FeatureContext,id:string,kind:string,entityId:string,value:unknown):D1PreparedStatement {return ctx.db.prepare('INSERT INTO intelligence_revisions(id,workspace_id,entity_kind,entity_id,content_json,actor_id,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,ctx.actor.workspaceId,kind,entityId,JSON.stringify(value),ctx.actor.id,ctx.now);}
export function id(){return createUlid();}
export const json=(value:unknown)=>JSON.stringify(value);
