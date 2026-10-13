import {archiveMediaType} from '../archive';
import {archiveMediaSource} from '../archive-stream';
import {reportCreated, reportMissingArchiveFile, reportUnmapped} from '../report';
import type {ImportedMedia, ImportReport} from '../types';
import {nameMatches, property, propertyIds, type ConfluenceEntity} from './xml-entities';

/** Numeric archive coordinates are attachment identities, not filenames. */
export function xmlMedia(entities: ConfluenceEntity[], files: Map<string, Uint8Array>, aliases: Map<string, string>, report: ImportReport): ImportedMedia[] {
  const attachments = entities.filter(entity => nameMatches(entity, 'Attachment'));
  const seen = new Set<string>(), duplicates = new Set<string>();
  for (const attachment of attachments) { if (seen.has(attachment.id)) duplicates.add(attachment.id); seen.add(attachment.id); }
  const paths = [...files.keys()];
  const media: ImportedMedia[] = [];
  for (const attachment of attachments) {
    const sourceId = `confluence-attachment:${attachment.id}`;
    const name = property(attachment, 'fileName', 'title', 'name');
    const owners = propertyIds(attachment, 'container', 'content', 'page', 'containerId', 'contentId', 'pageId');
    const owner = owners.length ? aliases.get(owners[0]!) : undefined;
    if (duplicates.has(attachment.id) || !owner || owners.some(id => aliases.get(id) !== owner)) {
      reportUnmapped(report, 'Confluence attachment has no unambiguous current page owner', sourceId, `Explicit content references: ${owners.join(', ') || '(none)'}. Original retained; no file published.`); continue;
    }
    if (!name) { reportUnmapped(report, 'Confluence attachment has no filename', sourceId); continue; }
    const versions = propertyIds(attachment, 'version', 'versionNumber');
    const numeric = paths.filter(path => {
      const match = path.match(/(?:^|\/)attachments\/([^/]+)\/([^/]+)\/([^/]+)$/);
      return match && aliases.get(match[1]!) === owner && match[2] === attachment.id;
    });
    const matching = numeric.filter(path => !versions.length || versions.length === 1 && path.split('/').at(-1) === versions[0]);
    // Retain the previously supported filename layout only when a unique,
    // explicitly owned entity exists and no numeric layout contradicts it.
    const candidates = numeric.length ? matching : paths.filter(path => path.split('/').at(-1)?.toLowerCase() === name.toLowerCase());
    const sharedFilename = !numeric.length && attachments.filter(item => property(item, 'fileName', 'title', 'name')?.toLowerCase() === name.toLowerCase()).length > 1;
    if (versions.length > 1 || candidates.length > 1 || sharedFilename) { reportUnmapped(report, 'Confluence attachment archive path is ambiguous', sourceId, `Filename ${name}; version ${versions.join(', ') || '(unspecified)'}; paths ${candidates.join(', ') || '(none)'}.`); continue; }
    const archivePath = candidates[0];
    if (!archivePath) { reportMissingArchiveFile(report, numeric.length ? `attachments/${owners[0]}/${attachment.id}/${versions[0] ?? '(unspecified)'}` : name, sourceId); continue; }
    media.push({sourceId, sourceIdentityKind: 'native', ownerPageSourceId: owner, name, archivePath, mediaType: property(attachment, 'contentType', 'mediaType', 'mimeType') ?? archiveMediaType(name), source: archiveMediaSource(files, archivePath), get bytes() { return files.get(archivePath)!; }});
    reportCreated(report, 'file', name, sourceId);
  }
  return media;
}

/** References may use the export path or a vendor download URL. Filename-only
 * references resolve within their real owning page, never across pages. */
export function xmlMediaReference(href: string, owner: string, media: ImportedMedia[], aliases: Map<string, string>): string | undefined {
  let path: string;
  try { path = decodeURIComponent(new URL(href, 'https://archive.invalid/').pathname).replace(/^\//, ''); } catch { return undefined; }
  const download = path.match(/(?:^|\/)download\/attachments\/([^/]+)\/(.+)$/);
  const candidates = media.filter(item => download
    ? item.ownerPageSourceId === aliases.get(download[1]!) && item.name === download[2]
    : path === item.archivePath || item.ownerPageSourceId === owner && path === item.name);
  return candidates.length === 1 ? candidates[0]!.sourceId : undefined;
}
