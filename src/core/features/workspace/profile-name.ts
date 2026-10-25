import { z } from 'zod';
import { isPersonalName, personInitials } from '../../shared/person-identity';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { mutationGuard } from '../../app/operations';

export const displayNameInput = z.string().trim().min(1).max(160).refine(isPersonalName, 'Enter your name.');

/** Directory custody is durable, independent of the current session's sign-in method. */
export const managedNameSql = (member: string) => `(EXISTS(SELECT 1 FROM scim_resources sr WHERE sr.member_id=${member}.id AND sr.workspace_id=${member}.workspace_id AND sr.resource_type='User' AND sr.state!='deleted') OR EXISTS(SELECT 1 FROM member_identity_bindings ib JOIN saml_provider_config sp ON sp.idp_entity_id=ib.issuer WHERE ib.member_id=${member}.id))`;

export async function profileNameStatements(ctx: FeatureContext, id: string, name: string) {
  const member = await ctx.db.prepare(`SELECT email,${managedNameSql('m')} AS managed FROM members m WHERE m.id=? AND m.workspace_id=? AND m.status='active'`).bind(id,ctx.actor.workspaceId).first<{email:string;managed:number}>();
  if (!member) throw new ApiProblem(404,'NOT_FOUND','Member unavailable.');
  if (member.managed) throw new ApiProblem(403,'DIRECTORY_MANAGED_NAME','Your name is managed by your directory.');
  return [
    mutationGuard(ctx.db,`SELECT NOT ${managedNameSql('m')} FROM members m WHERE m.id=? AND m.workspace_id=? AND m.status='active'`,[id,ctx.actor.workspaceId]),
    ctx.db.prepare('UPDATE members SET display_name=?,initials=?,updated_at=? WHERE id=?').bind(name,personInitials(name,member.email),ctx.now,id),
  ];
}
