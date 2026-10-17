import {reportUnmapped} from '../report';
import type {ImportReport} from '../types';
import {nameMatches, property, propertyIds, type ConfluenceEntity} from './xml-entities';

/** Page revisions are Page objects too. Resolve the exported identity graph
 * before producing any live page, parent, link or attachment owner. */
export function xmlHistory(entities: ConfluenceEntity[], report: ImportReport) {
  const candidates = entities.filter(entity => nameMatches(entity, 'Page') || nameMatches(entity, 'Folder') || nameMatches(entity, 'BlogPost'));
  const byId = new Map<string, ConfluenceEntity>();
  const duplicate = new Set<string>();
  for (const entity of candidates) {
    if (byId.has(entity.id)) duplicate.add(entity.id);
    byId.set(entity.id, entity);
  }
  const historical = new Set<string>();
  const edges = new Map<string, Set<string>>();
  const add = (id: string, owner: string) => {
    historical.add(id);
    const owners = edges.get(id) ?? new Set<string>();
    owners.add(owner); edges.set(id, owners);
  };
  for (const entity of candidates) {
    const originals = propertyIds(entity, 'originalVersion');
    const rawOriginal = entity.properties.get('originalVersion');
    const malformedReference = rawOriginal && typeof rawOriginal === 'object' && !Array.isArray(rawOriginal) && !('null' in rawOriginal) && ('id' in rawOriginal || 'object' in rawOriginal);
    if (originals.length || malformedReference || property(entity, 'originalVersion') || property(entity, 'contentStatus', 'status')?.toLowerCase() === 'historical') historical.add(entity.id);
    for (const id of originals) add(entity.id, id);
    for (const id of propertyIds(entity, 'historicalVersions')) {
      add(id, entity.id);
      if (!byId.has(id)) reportUnmapped(report, 'Confluence historical version reference is missing', `confluence-page:${entity.id}`, `confluence-page:${id}`);
    }
  }
  const resolved = new Map<string, string | undefined>();
  for (const id of duplicate) resolved.set(id, undefined);
  for (const entity of candidates) if (!historical.has(entity.id) && !duplicate.has(entity.id)) resolved.set(entity.id, entity.id);

  // Iterative DFS avoids recursion depth depending on the archive. A cycle,
  // absent target or disagreement between explicit edges invalidates the chain.
  for (const id of historical) {
    if (resolved.has(id)) continue;
    const active = new Set<string>();
    const stack = [{id, finish: false}];
    while (stack.length) {
      const frame = stack.pop()!;
      if (resolved.has(frame.id)) continue;
      if (frame.finish) {
        const targets = [...(edges.get(frame.id) ?? [])];
        const owners = targets.map(target => resolved.get(target));
        resolved.set(frame.id, owners.length && owners.every(owner => owner && owner === owners[0]) ? owners[0] : undefined);
        active.delete(frame.id);
      } else if (!byId.has(frame.id) || active.has(frame.id)) {
        resolved.set(frame.id, undefined);
      } else {
        active.add(frame.id); stack.push({id: frame.id, finish: true});
        for (const target of edges.get(frame.id) ?? []) if (!resolved.has(target)) stack.push({id: target, finish: false});
      }
    }
  }
  const revisions = new Map<string, ConfluenceEntity[]>();
  const aliases = new Map<string, string>();
  for (const entity of byId.values()) {
    const owner = resolved.get(entity.id);
    if (!owner) {
      reportUnmapped(report, 'Confluence page history has no unambiguous current owner', `confluence-page:${entity.id}`, `Unresolved, cyclic or conflicting Page references: ${[...(edges.get(entity.id) ?? [])].join(', ') || '(none)'}. Original retained; no independent page published.`);
      continue;
    }
    aliases.set(entity.id, `confluence-page:${owner}`);
    if (historical.has(entity.id)) {
      const list = revisions.get(owner) ?? []; list.push(entity); revisions.set(owner, list);
    }
  }
  return {pages: [...byId.values()].filter(entity => resolved.get(entity.id) === entity.id && !historical.has(entity.id)), revisions, aliases};
}
