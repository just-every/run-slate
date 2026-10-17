import type { FeatureContext } from '../../app/feature-context';
import { requestHash } from '../../app/operations';
import { createUlid } from '../../shared/ulid';

/** Canonical initial content, shared by a verified owner claim and the local wizard. */
export async function firstRunRecords(ctx: Pick<FeatureContext, 'db' | 'now'> & { actor: Pick<FeatureContext['actor'], 'id' | 'workspaceId'> }, input: { containerName: string; pageTitle: string }, revisionId: string) {
  const containerId = createUlid(), pageId = createUlid(), pageRevision = createUlid();
  const { db, actor, now } = ctx;
  return { containerId, pageId, statements: [
    db.prepare("INSERT INTO containers (id,workspace_id,name,visibility,created_at,updated_at,revision_id) VALUES (?,?,?,'default',?,?,?)").bind(containerId,actor.workspaceId,input.containerName,now,now,revisionId),
    db.prepare('INSERT INTO container_owners (container_id,member_id,created_at) VALUES (?,?,?)').bind(containerId,actor.id,now),
    db.prepare('INSERT INTO container_members (container_id,member_id,created_at) VALUES (?,?,?)').bind(containerId,actor.id,now),
    db.prepare("INSERT INTO container_grants (id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES (?,?,'member',?,'full',?,?)").bind(createUlid(),containerId,actor.id,now,now),
    db.prepare("INSERT INTO pages (id,workspace_id,container_id,title,author_member_id,owner_member_id,lifecycle,working_revision_id,published_revision_id,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,'live',?,?,?,?,?)").bind(pageId,actor.workspaceId,containerId,input.pageTitle,actor.id,actor.id,pageRevision,pageRevision,now,now,pageRevision),
    db.prepare('UPDATE containers SET home_page_id=? WHERE id=?').bind(pageId,containerId),
    db.prepare("INSERT INTO page_grants (id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES (?,?,'workspace',?,'view',?,?)").bind(createUlid(),pageId,actor.workspaceId,now,now),
    db.prepare("INSERT INTO page_revisions (id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES (?,?,?,'publish',?,?,?,?)").bind(pageRevision,pageId,actor.id,await requestHash({body:[],properties:{title:input.pageTitle}}),'[]',JSON.stringify({title:input.pageTitle}),now),
  ] };
}
