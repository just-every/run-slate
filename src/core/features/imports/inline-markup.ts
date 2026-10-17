import { attributesOf, childNodes, elementName, type MarkupNode } from './markup';
import { statusColour } from './portable-blocks';
import { safeImportLink } from './url';
import type { ImportedLink, ImportedStatus, ImportedStatusColour } from './types';

interface InlineOptions {
  skip?: (node: MarkupNode) => boolean;
  status?: (node: MarkupNode) => {text: string; colour?: ImportedStatusColour} | undefined;
}

/** Keep offsets through whitespace normalization so adjacent prose retains its order. */
export function inlineMarkup(node: MarkupNode, options: InlineOptions = {}) {
  let raw = '';
  const links: ImportedLink[] = [], statuses: ImportedStatus[] = [];
  const visit = (candidate: MarkupNode, root = false) => {
    if (!root && options.skip?.(candidate)) return;
    if ('value' in candidate && typeof candidate.value === 'string') { raw += candidate.value; return; }
    const tag = elementName(candidate), attrs = attributesOf(candidate);
    const status = options.status?.(candidate);
    if (status) {
      const textStart = raw.length;
      raw += status.text;
      if (status.colour) statuses.push({textStart, textEnd: raw.length, colour: status.colour});
      return;
    }
    if (tag === 'br') { raw += '\n'; return; }
    const textStart = raw.length;
    childNodes(candidate).forEach(child => visit(child));
    const colour = tag === 'span' ? statusColour(attrs['data-slate-status']) : undefined;
    if (colour) statuses.push({textStart, textEnd: raw.length, colour});
    if (tag === 'a') {
      const link = safeImportLink(attrs.href ?? '');
      if (link) links.push({...link, textStart, textEnd: raw.length});
    }
  };
  // The caller owns the root; only its descendants are candidates for exclusion.
  visit(node, true);
  let text = '', whitespace = false;
  const starts: number[] = [], ends: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (/\s/.test(char)) { starts[i] = text.length; ends[i] = text.length; whitespace = true; continue; }
    if (whitespace && text) text += ' ';
    whitespace = false;
    starts[i] = text.length;
    text += char;
    ends[i] = text.length;
  }
  const range = <T extends {textStart?: number; textEnd?: number}>(entry: T): T => ({...entry, textStart: starts[entry.textStart!] ?? text.length, textEnd: ends[entry.textEnd! - 1] ?? text.length});
  return {text, links: links.map(range), statuses: statuses.map(range).filter(status => status.textEnd > status.textStart)};
}
