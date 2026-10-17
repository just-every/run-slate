import {nameMatches, property, propertyIds, type ConfluenceEntity} from './xml-entities';

type Resolution = {owner: string; reason?: never} | {owner?: never; reason: string};
export type XmlPageResolver = (attributes: Record<string, string>, sourceOwner: string,resourceKind?:'post') => Resolution;

/** Titles are meaningful only in an exported space. Index all identities before
 * rendering bodies, including unresolved history as an ambiguity, never as a
 * second live page. Explicit IDs can disambiguate an otherwise repeated title. */
export function xmlResourceContext(entities: ConfluenceEntity[], aliases: Map<string, string>, revisions: Map<string, ConfluenceEntity[]>): XmlPageResolver {
  const spaces = entities.filter(entity => nameMatches(entity, 'Space'));
  const spaceCounts = new Map<string, number>();
  const spaceKeys = new Map<string, Set<string>>();
  for (const space of spaces) {
    spaceCounts.set(space.id, (spaceCounts.get(space.id) ?? 0) + 1);
    const key = property(space, 'key');
    if (key) { const ids = spaceKeys.get(key) ?? new Set<string>(); ids.add(space.id); spaceKeys.set(key, ids); }
  }
  const exportedSpace = (entity: ConfluenceEntity) => {
    const ids = propertyIds(entity, 'spaceId', 'space');
    return ids.length === 1 && spaceCounts.get(ids[0]!) === 1 ? ids[0] : undefined;
  };
  const pages = entities.filter(entity => nameMatches(entity, 'Page') || nameMatches(entity, 'Folder') || nameMatches(entity, 'BlogPost'));
  const blogOwners=new Set(pages.filter(entity=>nameMatches(entity,'BlogPost')).flatMap(entity=>aliases.has(entity.id)?[aliases.get(entity.id)!]:[]));
  const titleKey=(title:string,kind:'page'|'post')=>JSON.stringify([kind,title]);
  const ownerSpaces = new Map<string, string>();
  for (const page of pages) {
    const owner = aliases.get(page.id), space = exportedSpace(page);
    if (owner === `confluence-page:${page.id}` && space) ownerSpaces.set(owner, space);
  }
  const titles = new Map<string, Map<string, Set<string | undefined>>>();
  const versionOwners = new Map<ConfluenceEntity, string>();
  for (const [id, snapshots] of revisions) for (const snapshot of snapshots) if (nameMatches(snapshot, 'Version')) versionOwners.set(snapshot, `confluence-page:${id}`);
  for (const page of [...pages, ...versionOwners.keys()]) {
    const owner = nameMatches(page, 'Version') ? versionOwners.get(page) : aliases.get(page.id);
    // A historical snapshot without space metadata inherits its proven current
    // owner context. Conflicting or unknown explicit space metadata never does.
    const hasSpace = page.properties.has('spaceId') || page.properties.has('space');
    const space = exportedSpace(page) ?? (!hasSpace && owner ? ownerSpaces.get(owner) : undefined);
    const title = property(page, 'title', 'name');
    if (!space || !title) continue;
    const byTitle = titles.get(space) ?? new Map<string, Set<string | undefined>>();
    const key=titleKey(title,nameMatches(page,'BlogPost')||!!owner&&blogOwners.has(owner)?'post':'page');
    const owners = byTitle.get(key) ?? new Set<string | undefined>();
    owners.add(owner); byTitle.set(key, owners); titles.set(space, byTitle);
  }
  return (attributes, sourceOwner,resourceKind) => {
    const id = attributes['ri:content-id'], title = attributes['ri:content-title'], key = attributes['ri:space-key'];
    for (const name of ['ri:content-id', 'ri:content-title', 'ri:space-key']) {
      if (name in attributes && !attributes[name]?.trim()) return {reason: `empty ${name}`};
    }
    let space: string | undefined;
    if (key !== undefined) {
      const ids = spaceKeys.get(key);
      if (!ids?.size) return {reason: `space key ${JSON.stringify(key)} is not exported`};
      if (ids.size !== 1 || spaceCounts.get([...ids][0]!) !== 1) return {reason: `space key ${JSON.stringify(key)} is ambiguous`};
      space = [...ids][0];
    }
    if (id !== undefined) {
      const owner = aliases.get(id);
      if (!owner) return {reason: `content ID ${JSON.stringify(id)} has no unambiguous current owner`};
      if(resourceKind==='post'&&!blogOwners.has(owner))return {reason:'blog resource names a wiki page'};
      const ownerSpace = ownerSpaces.get(owner);
      if (space && space !== ownerSpace) return {reason: 'content ID conflicts with the exported space key'};
      if (title !== undefined && !titles.get(space ?? ownerSpace ?? '')?.get(titleKey(title,blogOwners.has(owner)?'post':'page'))?.has(owner)) return {reason: 'content ID conflicts with the title in its exported space'};
      return {owner};
    }
    if (title === undefined) return {reason: 'page reference has neither a content ID nor a title'};
    space ??= ownerSpaces.get(sourceOwner);
    if (!space) return {reason: 'source page has no unambiguous exported space'};
    const candidates=titles.get(space)?.get(titleKey(title,resourceKind??'page'));
    if (!candidates?.size) return {reason: `title ${JSON.stringify(title)} is missing from exported space ${JSON.stringify(space)}`};
    const owner = [...candidates][0];
    if (candidates.size !== 1 || !owner) return {reason: `title ${JSON.stringify(title)} has no unique current owner in exported space ${JSON.stringify(space)}`};
    return {owner};
  };
}
