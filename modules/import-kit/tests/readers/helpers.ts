import assert from 'node:assert/strict';
import type { ApiSourceInput, Json, ParsedRecord } from '../../src/types.ts';
import { ReaderError } from '../../src/readers/index.ts';

export const bytes = (text: string) => new TextEncoder().encode(text);
export function record(value: Json): ParsedRecord {
  const row = value as { id: string; kind?: string };
  return { kind: row.kind ?? 'ticket', sourceId: row.id, payload: value };
}
export const pageParser: ApiSourceInput['parsePage'] = value => {
  const page = value as { items: Json[]; next?: string | null };
  return { records: page.items.map(record), next: page.next };
};
export const apiInput = (extra: Partial<ApiSourceInput> = {}): ApiSourceInput => ({ namespace: 'source-a', url: 'https://import.example.test/items', parsePage: pageParser, ...extra });
export function jsonResponse(items: Json[], next?: string | null): Response { return Response.json({ items, ...(next !== undefined ? { next } : {}) }); }
export function code(expected: string): (error: unknown) => boolean {
  return error => { assert.ok(error instanceof ReaderError); assert.equal(error.code, expected); assert.equal(error.diagnostics[0].code, expected); return true; };
}
