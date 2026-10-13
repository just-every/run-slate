import { readFile } from 'node:fs/promises';
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
/** Aurora belongs only to tests; product startup and sign-in never seed it. */
export async function seedAurora(execute) {
  const workspace = JSON.parse(await readFile(new URL('./workspace.json', import.meta.url), 'utf8'));
  const members = JSON.parse(await readFile(new URL('./members.json', import.meta.url), 'utf8'));
  const statements = [`INSERT INTO workspaces(id,name,mark,description,created_at,updated_at,revision_id) VALUES(${[workspace.id,workspace.name,workspace.mark,workspace.description,workspace.createdAt,workspace.updatedAt,workspace.revisionId].map(quote).join(',')})`];
  for (const member of members) statements.push(`INSERT INTO members(id,workspace_id,email,display_name,initials,role,is_setup_owner,created_at,updated_at) VALUES(${[member.id,member.workspaceId,member.email,member.displayName,member.initials,member.role].map(quote).join(',')},${Number(member.isSetupOwner)},${quote(member.createdAt)},${quote(member.updatedAt)})`);
  await execute(statements.join(';'));
}
