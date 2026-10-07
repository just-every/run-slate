import type {FeatureContext} from '../../app/feature-context';
import {requestHash} from '../../app/operations';
export async function identityRevision(ctx:FeatureContext,revisionId:string,kind:string,id:string,value:unknown){return ctx.db.prepare('INSERT INTO core_entity_revisions (id,workspace_id,entity_kind,entity_id,content_hash,content_json,author_member_id,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(revisionId,ctx.actor.workspaceId,kind,id,await requestHash(value),JSON.stringify(value),ctx.actor.id,ctx.now);}
