import {serialize, type DefaultTreeAdapterMap} from 'parse5';
import {attributesOf, childNodes, elementName, expandSelfClosingTags, findElements, parseMarkupFragment, textOf, type MarkupNode} from '../markup';
import {reportUnmapped} from '../report';
import type {ImportedBlock, ImportedMedia, ImportReport} from '../types';
import {parseStorageFormat} from './storage';
import {xmlMediaReference} from './xml-media';
import type {XmlPageResolver} from './xml-resource-context';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const supportedStorage = new Set(['ac:image', 'ac:link', 'ac:link-body', 'ac:plain-text-link-body', 'ac:structured-macro', 'ac:parameter', 'ac:plain-text-body', 'ac:rich-text-body', 'ac:layout', 'ac:layout-section', 'ac:layout-cell', 'ac:task-list', 'ac:task', 'ac:task-id', 'ac:task-status', 'ac:task-body', 'ac:placeholder', 'ac:inline-comment-marker', 'ri:attachment', 'ri:page', 'ri:url']);

/** Resolve XML resources in their exported identity/space context before the
 * shared renderer turns storage markup into blocks. Unresolved resources keep
 * text and a named loss; reference tokens cannot be reinterpreted as IDs. */
export function xmlStorageBlocks(body: string, sourceId: string, owner: string, media: ImportedMedia[], aliases: Map<string, string>, resolvePage: XmlPageResolver, report: ImportReport): ImportedBlock[] {
  const fragment = parseMarkupFragment(expandSelfClosingTags(body));
  const originalValues = new Set<string>();
  const collectValues = (node: MarkupNode) => {
    for (const value of Object.values(attributesOf(node))) originalValues.add(value.trim());
    childNodes(node).forEach(collectValues);
  };
  collectValues(fragment);
  const references = new Map<string, {label: string; kind: 'page' | 'attachment'; target?: string}>();
  let resourceOrdinal = 0;
  const resource = (label: string, kind: 'page' | 'attachment', target?: string) => {
    let token: string;
    do { token = `xml-import-resource:${resourceOrdinal++}`; } while (originalValues.has(token));
    references.set(token, {label, kind, target}); return token;
  };
  const note = (label: string, detail?: string) => reportUnmapped(report, label, sourceId, detail);
  const setAttribute = (node: MarkupNode, name: string, value: string) => {
    if (!('attrs' in node)) return;
    node.attrs = node.attrs.filter(attribute => attribute.name !== name);
    node.attrs.push({name, value});
  };
  const attachmentReference = (node: MarkupNode): {file?: ImportedMedia; reason?: string} => {
    const attrs = attributesOf(node), pages = findElements(node, 'ri:page');
    if (pages.length > 1) return {reason: 'multiple attachment owner page references'};
    const page = pages[0];
    const resolved: ReturnType<XmlPageResolver> = page ? resolvePage(attributesOf(page), owner) : {owner};
    if (!resolved.owner) return {reason: `attachment owner: ${resolved.reason}`};
    const targetOwner = resolved.owner;
    const id = attrs['ri:content-id'], name = attrs['ri:filename'], version = attrs['ri:version-at-save'] ?? attrs['ri:version'];
    for (const attribute of ['ri:content-id', 'ri:filename', 'ri:version-at-save', 'ri:version']) if (attribute in attrs && !attrs[attribute]?.trim()) return {reason: `empty ${attribute}`};
    if (attrs['ri:version-at-save'] && attrs['ri:version'] && attrs['ri:version-at-save'] !== attrs['ri:version']) return {reason: 'conflicting attachment versions'};
    const candidates = media.filter(item => item.ownerPageSourceId === targetOwner && (!id || item.sourceId === `confluence-attachment:${id}`) && (!name || item.name === name) && (!version || item.archivePath?.split('/').at(-1) === version));
    return (id || name) && candidates.length === 1 ? {file: candidates[0]} : {reason: 'attachment ID, filename or version does not identify one file on the referenced owner'};
  };
  const visit = (node: MarkupNode) => {
    const tag = elementName(node);
    if (tag && /^(?:ac|ri):/.test(tag) && !supportedStorage.has(tag)) note(`Confluence XML storage element <${tag}> is unsupported`, textOf(node).trim() || undefined);
    // The shared renderer understands storage images. Normalize ordinary HTML
    // images into that same path so existing XML HTML bodies retain their media.
    if (tag === 'img' && 'tagName' in node) {
      const attrs = attributesOf(node), href = attrs.src;
      if (!href) { note('Confluence image has no resource reference'); return; }
      const target = xmlMediaReference(href, owner, media, aliases);
      const file = target && media.find(item => item.sourceId === target);
      const child = file ? `<ri:attachment ri:filename="${escape(file.archivePath!)}"></ri:attachment>` : `<ri:url ri:value="${escape(href)}"></ri:url>`;
      node.tagName = 'ac:image'; node.attrs = [{name: 'ac:alt', value: attrs.alt ?? ''}];
      node.childNodes = childNodes(parseMarkupFragment(child)) as typeof node.childNodes;
      for (const child of node.childNodes) child.parentNode = node;
      return;
    }
    if (tag === 'ac:image' || tag === 'ac:link') {
      const attachments = findElements(node, 'ri:attachment'), pages = findElements(node, 'ri:page');
      const attachment = attachments[0];
      if (attachments.length > 1 || (attachment && pages.some(page => !findElements(attachment, 'ri:page').includes(page))) || (!attachment && pages.length > 1)) {
        const label = textOf(node).trim() || '(conflicting resource references)';
        const token = resource(label, attachment ? 'attachment' : 'page');
        const detail = JSON.stringify({pages: pages.map(attributesOf), attachments: attachments.map(attributesOf)});
        for (const page of pages) setAttribute(page, 'ri:content-title', token);
        for (const file of attachments) setAttribute(file, 'ri:filename', token);
        note('Confluence storage reference has conflicting resource identities', detail);
        return;
      }
      if (attachment) {
        const attrs = attributesOf(attachment), resolved = attachmentReference(attachment);
        const label = [attrs['ri:filename'], attrs['ri:content-id']].find(value => value?.trim()) ?? '(missing identity)';
        setAttribute(attachment, 'ri:filename', resource(label, 'attachment', resolved.file?.sourceId));
        if (!resolved.file) note('Confluence attachment reference has no unambiguous imported owner or version', JSON.stringify({attributes: attrs, pages: pages.map(attributesOf), reason: resolved.reason}));
        // The shared renderer searches ri:page first. This nested ri:page is
        // attachment ownership, already resolved above, not a page link.
        const removeOwner = (node: MarkupNode) => { if ('childNodes' in node) { node.childNodes = node.childNodes.filter(child => elementName(child) !== 'ri:page'); childNodes(node).forEach(removeOwner); } };
        removeOwner(attachment);
      } else if (tag === 'ac:link') {
        const page = findElements(node, 'ri:page')[0];
        if (page) {
          const attrs = attributesOf(page), resolved = resolvePage(attrs, owner);
          const label = [attrs['ri:content-title'], attrs['ri:content-id']].find(value => value?.trim()) ?? '(missing identity)';
          setAttribute(page, 'ri:content-title', resource(label, 'page', resolved.owner));
          if (!resolved.owner) note('Confluence page reference has no unambiguous exported identity', JSON.stringify({attributes: attrs, reason: resolved.reason}));
        }
      }
    }
    childNodes(node).forEach(visit);
  };
  visit(fragment);
  const parsed = parseStorageFormat(serialize(fragment as DefaultTreeAdapterMap['documentFragment']), sourceId);
  for (const construct of parsed.constructs) note(construct.label, construct.detail);
  const resolve = (blocks: ImportedBlock[]) => {
    for (const block of blocks) {
      for (const link of block.links) {
        // Ordinary anchors and ri:url are external even when their supplied
        // href happens to match a generated resource token.
        const reference = link.kind === 'page' || link.kind === 'attachment' ? references.get(link.href) : undefined;
        if (reference) {
          if (block.text === link.href || !block.text) block.text = reference.label;
          link.kind = reference.kind; link.targetSourceId = reference.target;
          if (block.kind === 'media' && reference.target) block.mediaSourceId = reference.target;
          continue;
        }
        const pageId = link.href.match(/[?&]pageId=([^&#/]+)/i)?.[1] ?? link.href.match(/^page:(.+)$/i)?.[1];
        const target = pageId ? aliases.get(pageId) : undefined;
        const attachment = xmlMediaReference(link.href, owner, media, aliases);
        if (target) { link.kind = 'page'; link.targetSourceId = target; }
        else if (attachment) { link.kind = 'attachment'; link.targetSourceId = attachment; if (block.kind === 'media') block.mediaSourceId = attachment; }
      }
      const unresolved = block.links.filter(link => (link.kind === 'page' || link.kind === 'attachment') && !link.targetSourceId);
      if (unresolved.length) {
        for (const link of unresolved) if (!references.has(link.href)) note('Confluence storage reference could not be resolved', link.href);
        block.text ??= unresolved.map(link => link.href).join(' ');
        block.links = block.links.filter(link => !unresolved.includes(link));
        if (block.kind === 'media' || block.kind === 'link') block.kind = 'paragraph';
      } else if (block.kind === 'media' && !block.mediaSourceId) {
        block.kind = 'link'; note('Confluence image imported as an external link', block.links[0]?.href);
      }
      resolve(block.children);
    }
  };
  resolve(parsed.blocks); return parsed.blocks;
}
