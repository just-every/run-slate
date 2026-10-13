import {nameMatches, property, propertyIds, propertyValues, type ConfluenceEntity} from './xml-entities';
import {reportUnmapped} from '../report';
import type {ImportedGrant, ImportedMember, ImportReport} from '../types';

function identityIndex(entities: ConfluenceEntity[], kind: string) {
  const index = new Map<string, ConfluenceEntity[]>();
  for (const entity of entities.filter(item => nameMatches(item, kind))) {
    const values = index.get(entity.id) ?? []; values.push(entity); index.set(entity.id, values);
  }
  return index;
}

/** Source keys and usernames are archive identities, never destination account
 * lookups. Multiple authority assertions must agree before a grant is emitted. */
type RestrictionPrincipal = {kind: 'group'; sourceId: string} | {kind: 'member'; sourceId: string; displayName: string} | {reason: string};
function restrictionPrincipal(permission: ConfluenceEntity, users: Map<string, ConfluenceEntity[]>): RestrictionPrincipal {
  const groups = propertyValues(permission, 'groupName', 'groupname');
  const names = propertyValues(permission, 'userName', 'username');
  const refs = propertyIds(permission, 'userSubject', 'user');
  if (groups.length > 1 || names.length > 1 || refs.length > 1) return {reason: 'conflicting user or group identity assertions'};
  if (groups.length && (names.length || refs.length)) return {reason: 'both user and group identities are asserted'};
  if (groups.length) return {kind: 'group' as const, sourceId: `confluence-group:${groups[0]}`};
  const matches = refs.length ? users.get(refs[0]!) : undefined;
  if (matches && matches.length !== 1) return {reason: `duplicate user identity ${refs[0]}`};
  const user = matches?.[0];
  if (refs.length && !user && names.length && names[0] !== refs[0]) return {reason: 'unresolved user reference conflicts with explicit username'};
  let key = names[0] ?? refs[0];
  if (user) {
    const keys = propertyValues(user, 'key'), usernames = propertyValues(user, 'name'), lowerNames = propertyValues(user, 'lowerName');
    if (keys.length > 1 || usernames.length > 1 || lowerNames.length > 1) return {reason: `conflicting identity properties on user ${user.id}`};
    // key is canonical; name/lowerName are explicit source aliases. They need
    // not equal the opaque key, but a supplied username must match an alias.
    key = keys[0] ?? usernames[0] ?? lowerNames[0] ?? user.id;
    if (names.length && ![key, ...usernames, ...lowerNames].includes(names[0]!)) return {reason: `username conflicts with referenced user ${user.id}`};
  }
  if (!key) return {reason: 'missing user or group identity'};
  return {kind: 'member' as const, sourceId: `confluence-member:${key}`, displayName: user ? property(user, 'name', 'displayName') ?? key : key};
}

/** Server/DC permission sets are restrictions, including empty sets. Preserve
 * every record of duplicate identities before deriving content or principals. */
export function xmlRestrictions(entities: ConfluenceEntity[], report: ImportReport) {
  const restricted = new Set<string>();
  const grants = new Map<string, ImportedGrant[]>();
  const members = new Map<string, ImportedMember>();
  const closed = new Set<string>();
  const sets = identityIndex(entities, 'ContentPermissionSet');
  const users = identityIndex(entities, 'ConfluenceUserImpl');
  const permissions = identityIndex(entities, 'ContentPermission');
  const reverseSets = new Map<string, Set<string>>();
  const close = (contents: string[], sourceId: string, reason: string, references?: string[]) => {
    for (const content of contents) { restricted.add(content); closed.add(content); }
    reportUnmapped(report, 'Confluence restriction identities are ambiguous; access remains closed', sourceId, JSON.stringify({reason, contents, references}));
  };
  for (const [id, records] of sets) {
    const contents = [...new Set(records.flatMap(set => propertyIds(set, 'contentId', 'content')))];
    for (const content of contents) restricted.add(content);
    for (const set of records) for (const permission of propertyIds(set, 'permissions')) {
      const owners = reverseSets.get(permission) ?? new Set<string>(); owners.add(id); reverseSets.set(permission, owners);
    }
    if (records.length > 1 || contents.length > 1) close(contents, `confluence-permission-set:${id}`, records.length > 1 ? 'duplicate permission set identity' : 'conflicting content references');
    if (!contents.length) reportUnmapped(report, 'Confluence restriction set names no content', `confluence-permission-set:${id}`);
  }
  for (const [id, records] of permissions) {
    const setRefs = [...new Set([...records.flatMap(permission => propertyIds(permission, 'owningSet', 'permissionSet')), ...(reverseSets.get(id) ?? [])])];
    const referencedSets = setRefs.flatMap(id => sets.get(id) ?? []);
    const contents = [...new Set([...records.flatMap(permission => propertyIds(permission, 'contentId', 'content')), ...referencedSets.flatMap(set => propertyIds(set, 'contentId', 'content'))])];
    for (const content of contents) restricted.add(content);
    if (records.length > 1 || contents.length > 1 || setRefs.length > 1 || setRefs.some(id => sets.get(id)?.length !== 1)) {
      close(contents, `confluence-permission:${id}`, records.length > 1 ? 'duplicate permission identity' : 'conflicting or unresolved content/set references', setRefs); continue;
    }
    const permission = records[0]!;
    const content = contents[0];
    if (!content) { reportUnmapped(report, 'Confluence permission names no content', `confluence-permission:${permission.id}`); continue; }
    const types = [...new Set([permission, ...referencedSets].flatMap(entity => propertyValues(entity, 'type', 'permissionType')).map(type => type.toUpperCase()))];
    if (types.length > 1) { close(contents, `confluence-permission:${id}`, 'conflicting permission types', types); continue; }
    const type = types[0] ?? '';
    const level = ({VIEW:'view',EDIT:'edit',COMMENT:'comment',FULL:'full'} as const)[type as 'VIEW'|'EDIT'|'COMMENT'|'FULL'];
    const principal = restrictionPrincipal(permission, users);
    if ('reason' in principal) { close(contents, `confluence-permission:${id}`, principal.reason, propertyIds(permission, 'userSubject', 'user')); continue; }
    if (!level) {
      reportUnmapped(report, 'Unmapped Confluence restriction remains closed', `confluence-page:${content}`, `Permission ${permission.id}; type ${type || '(missing)'}`);
      continue;
    }
    const principalSourceId = principal.sourceId;
    if (principal.kind === 'member') members.set(principalSourceId, {sourceId:principalSourceId, sourceIdentityKind:'native', displayName:principal.displayName, status:'inactive-historical'});
    const list = grants.get(content) ?? [];
    if (!list.some(g => g.principalSourceId === principalSourceId && g.level === level)) list.push({principalKind:principal.kind,principalSourceId,level,general:false});
    grants.set(content,list);
  }
  for (const content of closed) grants.delete(content);
  return {restricted,grants,members:[...members.values()]};
}

/** Native history uses its current page's access. Intersect historical access
 * with current access rather than exposing an older restricted body. */
export function historicalRestrictions(current: ConfluenceEntity, history: ConfluenceEntity[], restrictions: ReturnType<typeof xmlRestrictions>, report: ImportReport) {
  const isRestricted = (entity: ConfluenceEntity) => restrictions.restricted.has(entity.id) || property(entity, 'restricted', 'hasRestrictions', 'isRestricted')?.toLowerCase() === 'true';
  let restricted = isRestricted(current);
  let grants = restrictions.grants.get(current.id) ?? [];
  const levels = ['view', 'comment', 'edit', 'full'] as const;
  const changed: string[] = [];
  const signature = (values: ImportedGrant[]) => values.map(grant => `${grant.principalKind}:${grant.principalSourceId}:${grant.level}`).sort().join('|');
  for (const revision of history) {
    if (!isRestricted(revision)) continue;
    const previous = restrictions.grants.get(revision.id) ?? [];
    const narrowed = restricted ? grants.flatMap(grant => {
      const match = previous.find(item => item.principalKind === grant.principalKind && item.principalSourceId === grant.principalSourceId);
      return match ? [{...grant, general: false, level: levels[Math.min(levels.indexOf(grant.level), levels.indexOf(match.level))]!}] : [];
    }) : previous;
    if (!restricted || signature(grants) !== signature(narrowed)) changed.push(`${nameMatches(revision, 'Version') ? 'confluence-version' : 'confluence-page'}:${revision.id}`);
    grants = narrowed; restricted = true;
  }
  if (changed.length) reportUnmapped(report, 'Confluence historical restrictions narrowed current page access', `confluence-page:${current.id}`, `Native history shares current-page access. Intersected historical restrictions from ${changed.join(', ')}; importing member retains recovery access.`);
  return {restricted, grants};
}
