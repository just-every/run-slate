function collapsed(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export interface RevisionTextBlock {
  text: string;
  children?: readonly RevisionTextBlock[];
}

export type RevisionPropertyText = string | number | boolean | null | readonly RevisionPropertyText[];

export interface RevisionContent {
  body: readonly RevisionTextBlock[];
  properties: Readonly<Record<string, RevisionPropertyText>>;
}

function extractBlock(block: RevisionTextBlock, output: string[]): void {
  const text = collapsed(block.text);
  if (text) output.push(text);
  for (const child of block.children ?? []) extractBlock(child, output);
}

function extractProperty(value: RevisionPropertyText, output: string[]): void {
  if (value === null) return;
  if (typeof value === "string") {
    const text = collapsed(value);
    if (text) output.push(text);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return;
  }
  for (const item of value) extractProperty(item, output);
}

export function extractRevisionText(value: RevisionContent): string {
  const output: string[] = [];
  for (const block of value.body) extractBlock(block, output);
  for (const key of Object.keys(value.properties).sort()) extractProperty(value.properties[key]!, output);
  return collapsed(output.join(" "));
}

export async function revisionContentHash(value: RevisionContent): Promise<string> {
  const bytes = new TextEncoder().encode(extractRevisionText(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
