import { createHash } from 'node:crypto';

/** Synthetic, deterministic Notion-shaped page exports, generated at test time.
 * Every value is invented; nothing is copied from a real workspace. */
const words = ['roadmap','meeting','notes','launch','design','review','customer','onboarding','pricing','release','sprint','retro','incident','handbook','policy','hiring','budget','research','draft','summary','café','naïve','résumé','—','“quoted”','owner’s','✓','→'];
function random(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const notionId = (i: number) => { const h = createHash('sha256').update('page-' + i).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`; };
const text = (content: string) => ({ type: 'text', text: { content, link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' }, plain_text: content, href: null });
function sentence(next: () => number, length: number): string {
  return Array.from({ length }, () => words[Math.floor(next() * words.length)]).join(' ');
}
const blockTypes = ['paragraph', 'heading_2', 'bulleted_list_item', 'to_do', 'quote'];
export function notionPage(i: number, blocks: number, parent: string | null, dependsOn: string[] = []) {
  const next = random(i + 1), id = notionId(i), title = sentence(next, 4);
  const time = new Date(Date.UTC(2025, 0, 1) + i * 3_600_000).toISOString();
  return {
    object: 'page', id, created_time: time, last_edited_time: time, archived: false,
    url: `https://www.notion.so/${title.replace(/[^a-z]+/gi, '-')}-${id.replace(/-/g, '')}`,
    parent: parent ? { type: 'page_id', page_id: parent } : { type: 'workspace', workspace: true },
    properties: { title: { id: 'title', type: 'title', title: [text(title)] }, Tags: { id: 'tags', type: 'multi_select', multi_select: [{ name: words[i % words.length], color: 'blue' }] } },
    ...(dependsOn.length ? { dependsOn } : {}),
    children: Array.from({ length: blocks }, (_, b) => {
      const type = blockTypes[b % blockTypes.length];
      return { object: 'block', id: notionId(i * 1000 + b + 1_000_000), type, [type]: { rich_text: [text(sentence(next, 12 + Math.floor(next() * 12)))], ...(type === 'to_do' ? { checked: next() > 0.5 } : {}) } };
    }),
  };
}
/** A workspace export of at least `bytes`, in pages of `blocks` blocks each. */
export function notionExport(bytes: number, blocks = 60): Buffer {
  const pages: unknown[] = []; let size = 2;
  while (size < bytes) {
    const i = pages.length, value = notionPage(i, blocks, i ? notionId(Math.floor((i - 1) / 4)) : null);
    size += Buffer.byteLength(JSON.stringify(value)) + 1; pages.push(value);
  }
  return Buffer.from(JSON.stringify(pages));
}
/** `count` pages, each depending on up to `fanout` earlier pages besides its parent. */
export function dependencyGraph(count: number, fanout = 6, blocks = 4): Buffer {
  return Buffer.from(JSON.stringify(Array.from({ length: count }, (_, i) => {
    const next = random(count + i), deps = new Set<string>();
    for (let d = 0; i && d < fanout; d++) deps.add(notionId(Math.floor(next() * i)));
    return notionPage(i, blocks, i ? notionId(Math.floor((i - 1) / 8)) : null, [...deps]);
  })));
}
