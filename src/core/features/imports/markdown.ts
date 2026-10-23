import {htmlBlocks} from './html';
import {createImportReport} from './report';
import type { ImportedBlock, ImportedLink, ImportedStatus } from "./types";
import { safeImportLink } from "./url";
import { parseTableOfContentsSettings } from "./portable-blocks";

const marker = /^\s*(#{1,6})\s+(.+)$/;
const bullet = /^\s*[-*+]\s+(.+)$/;
const ordered = /^\s*\d+[.)]\s+(.+)$/;
const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/;

function inlineMarkdown(source: string): { text: string; links: ImportedLink[]; statuses: ImportedStatus[] } {
  const links: ImportedLink[] = [], statuses: ImportedStatus[] = [];
  let text = "", cursor = 0;
  const tokens = /(!?)\[((?:\\.|[^\[\]\\]|\[(?:\\.|[^\[\]\\])*\]\{status:(?:grey|blue|green|yellow|red|purple)\})*)\](?:\{status:(grey|blue|green|yellow|red|purple)\}|\(([^()\n]*(?:\([^()\n]*\)[^()\n]*)*)\))/g;
  for (const match of source.matchAll(tokens)) {
    text += stripFormatting(source.slice(cursor, match.index));
    const label = match[3] ? {text: stripFormatting(match[2]!), statuses: []} : inlineMarkdown(match[2]!);
    const textStart = text.length;
    text += label.text;
    if (match[3]) statuses.push({textStart, textEnd: text.length, colour: match[3] as ImportedStatus["colour"]});
    else {
      statuses.push(...label.statuses.map(status => ({...status, textStart: status.textStart + textStart, textEnd: status.textEnd + textStart})));
      const link = safeImportLink(match[4]!);
      if (link) links.push({ ...link, textStart, textEnd: text.length });
    }
    cursor = match.index! + match[0].length;
  }
  text += stripFormatting(source.slice(cursor));
  return { text, links, statuses };
}

function block(sourceId: string, index: number, kind: ImportedBlock["kind"], text?: string): ImportedBlock {
  const inline = kind === "code" ? { text, links: [] } : inlineMarkdown(text ?? "");
  return {
    sourceId: `${sourceId}#block-${index}`,
    sourceIdentityKind: "path-derived",
    kind,
    text: inline.text,
    links: inline.links,
    ...("statuses" in inline && inline.statuses.length ? {statuses: inline.statuses} : {}),
    children: [],
  };
}

function stripFormatting(value: string): string {
  return value.replace(/\\([\\[\]*_`~<>])|([*_`~])/g, (_match, escaped: string | undefined) => escaped ?? "");
}

function tableRows(lines: string[]): string[][] {
  return lines.filter((line) => !/^\s*\|?\s*:?-{3,}/.test(line)).map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => inlineMarkdown(cell.trim()).text));
}

export function markdownBlocks(markdown: string, sourceId: string): ImportedBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ImportedBlock[] = [];
  let index = 0;

  for (let cursor = 0; cursor < lines.length; cursor += 1) {
    const line = lines[cursor]!;
    if(line.trim()==='<!-- slate:columns -->'){
      const end=lines.indexOf('<!-- /slate:columns -->',cursor+1);
      if(end!==-1){blocks.push(...htmlBlocks(lines.slice(cursor+1,end).join('\n'),`${sourceId}#layout-${index++}`,createImportReport()));cursor=end;continue;}
    }
    if (!line.trim()) continue;

    const toc = line.match(/^<!-- slate:table-of-contents (.+) -->$/);
    if (toc) {
      const settings = parseTableOfContentsSettings(toc[1]!);
      const end = lines.indexOf("<!-- /slate:table-of-contents -->", cursor + 1);
      if (settings && end >= 0) {
        const next = block(sourceId, index++, "table-of-contents");
        next.tableOfContents = settings;
        blocks.push(next);
        cursor = end;
        continue;
      }
    }
    if (/^<a id="block-[^"\n]*"><\/a>$/.test(line.trim())) continue;

    if (/^```/.test(line.trim())) {
      const language = line.trim().slice(3).trim();
      const code: string[] = [];
      cursor += 1;
      while (cursor < lines.length && !/^```/.test(lines[cursor]!.trim())) code.push(lines[cursor++]!);
      const next = block(sourceId, index++, "code", code.join("\n"));
      next.language = language || undefined;
      blocks.push(next);
      continue;
    }
    const heading = line.match(marker);
    if (heading) {
      const next = block(sourceId, index++, "heading", heading[2]!.trim());
      next.level = heading[1]!.length;
      blocks.push(next);
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push(block(sourceId, index++, "divider"));
      continue;
    }
    const checked = line.match(task);
    if (checked) {
      const next = block(sourceId, index++, "task", checked[2]!.trim());
      next.checked = checked[1]!.toLowerCase() === "x";
      blocks.push(next);
      continue;
    }
    const list = line.match(bullet);
    if (list) {
      blocks.push(block(sourceId, index++, "bulleted-list", list[1]!.trim()));
      continue;
    }
    const numbered = line.match(ordered);
    if (numbered) {
      blocks.push(block(sourceId, index++, "numbered-list", numbered[1]!.trim()));
      continue;
    }
    if (/^>\s?/.test(line)) {
      blocks.push(block(sourceId, index++, "quote", line.replace(/^>\s?/, "").trim()));
      continue;
    }
    if (line.includes("|") && cursor + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[cursor + 1]!)) {
      const table = [line, lines[++cursor]!];
      while (cursor + 1 < lines.length && lines[cursor + 1]!.includes("|")) table.push(lines[++cursor]!);
      const next = block(sourceId, index++, "table");
      next.rows = tableRows(table);
      blocks.push(next);
      continue;
    }

    const paragraph = [line.trim()];
    while (cursor + 1 < lines.length && lines[cursor + 1]!.trim() && !marker.test(lines[cursor + 1]!) && !bullet.test(lines[cursor + 1]!) && !ordered.test(lines[cursor + 1]!) && !task.test(lines[cursor + 1]!) && !/^>\s?/.test(lines[cursor + 1]!) && !/^```/.test(lines[cursor + 1]!) && !/^\s*(---+|\*\*\*+|___+)\s*$/.test(lines[cursor + 1]!)) {
      paragraph.push(lines[++cursor]!.trim());
    }
    const rawParagraph = paragraph.join(" ");
    blocks.push(block(sourceId, index++, "paragraph", rawParagraph));
  }
  return blocks;
}
