import { ImportError } from './errors';
import { createExpansionBudget, inflateBounded, reserveExpansion, type ExpansionBudget } from './inflate';
import type { ImportSafetyLimits } from './types';

export interface PdfName { name: string }
export interface PdfRef { ref: string }
export interface PdfString { bytes: Uint8Array }
export interface PdfDict { [key: string]: PdfValue }
export type PdfValue = null | boolean | number | PdfName | PdfRef | PdfString | PdfValue[] | PdfDict;
export interface PdfStream { dict: PdfDict; bytes: Uint8Array }
const pdfDocLow = '˘ˇˆ˙˝˛˚˜';
const pdfDocHigh = '•†‡…—–ƒ⁄‹›−‰„“”‘’‚™ﬁﬂŁŒŠŸŽıłœšž�';
export const isDict = (value: PdfValue | undefined): value is PdfDict => !!value && typeof value === 'object' && !Array.isArray(value) && !('name' in value) && !('ref' in value) && !('bytes' in value);
export const name = (value: PdfValue | undefined): string => value && typeof value === 'object' && 'name' in value ? String(value.name) : '';
export const number = (value: PdfValue | undefined, fallback = 0): number => typeof value === 'number' ? value : fallback;
export const array = (value: PdfValue | undefined): PdfValue[] => Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
export function string(value: PdfValue | undefined): string {
  if (!value || typeof value !== 'object' || !('bytes' in value) || !(value.bytes instanceof Uint8Array)) return '';
  const b = value.bytes;
  if (b[0] === 254 && b[1] === 255) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b[0] === 255 && b[1] === 254) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 239 && b[1] === 187 && b[2] === 191) return new TextDecoder().decode(b.subarray(3));
  return Array.from(b, byte => byte >= 24 && byte <= 31 ? pdfDocLow[byte - 24]! : byte >= 128 && byte <= 159 ? pdfDocHigh[byte - 128]! : byte === 160 ? '€' : byte === 127 || byte === 173 ? '�' : String.fromCharCode(byte)).join('');
}
const whitespace = (c: string | undefined) => c !== undefined && /[\0\t\n\f\r ]/.test(c);
const delimiter = (c: string | undefined) => c === undefined || whitespace(c) || /[()<>\[\]{}/%]/.test(c);
export function invalid(message: string): never { throw new ImportError('IMPORT_FORMAT_INVALID', `PDF ${message}.`); }
export function limit(message: string): never { throw new ImportError('IMPORT_ARCHIVE_LIMIT_EXCEEDED', `PDF ${message}.`); }

/** A PDF lexical reader, shared by indirect objects and content operands. */
export class PdfReader {
  position = 0;
  tokens = 0;
  constructor(readonly text: string, readonly maximumTokens: number, readonly shared?: { used: number; maximum: number }) {}
  skip() {
    while (this.position < this.text.length) {
      if (whitespace(this.text[this.position])) this.position++;
      else if (this.text[this.position] === '%') { while (this.position < this.text.length && !/[\r\n]/.test(this.text[this.position]!)) this.position++; }
      else break;
    }
  }
  word(): string {
    this.skip(); const start = this.position;
    while (this.position < this.text.length && !delimiter(this.text[this.position])) this.position++;
    return this.text.slice(start, this.position);
  }
  read(depth = 0): PdfValue {
    if (++this.tokens > this.maximumTokens || (this.shared && ++this.shared.used > this.shared.maximum) || depth > 64) limit('object complexity exceeds the import limit');
    this.skip(); const c = this.text[this.position++];
    if (c === undefined) invalid('ends inside an object');
    if (c === '/') {
      const start = this.position; while (!delimiter(this.text[this.position])) this.position++;
      return { name: this.text.slice(start, this.position).replace(/#([\da-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))) };
    }
    if (c === '(') {
      const bytes: number[] = []; let nesting = 1;
      while (this.position < this.text.length && nesting) {
        let ch = this.text[this.position++]!;
        if (ch === '\\') {
          ch = this.text[this.position++] ?? '';
          if (/[0-7]/.test(ch) && ch) { let octal = ch; for (let i = 0; i < 2 && /[0-7]/.test(this.text[this.position] ?? 'x'); i++) octal += this.text[this.position++]; bytes.push(parseInt(octal, 8) & 255); }
          else if (ch === '\r' || ch === '\n') { if (ch === '\r' && this.text[this.position] === '\n') this.position++; }
          else bytes.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 } as Record<string, number>)[ch] ?? ch.charCodeAt(0));
        } else if (ch === '(') { nesting++; bytes.push(40); }
        else if (ch === ')') { if (--nesting) bytes.push(41); }
        else bytes.push(ch.charCodeAt(0));
      }
      if (nesting) invalid('text string is not terminated');
      return { bytes: new Uint8Array(bytes) };
    }
    if (c === '<' && this.text[this.position] !== '<') {
      const end = this.text.indexOf('>', this.position); if (end < 0) invalid('hex string is not terminated');
      let hex = this.text.slice(this.position, end).replace(/\s/g, ''); if (!/^[\da-f]*$/i.test(hex)) invalid('hex string is malformed');
      if (hex.length % 2) hex += '0'; this.position = end + 1;
      return { bytes: Uint8Array.from(hex.match(/../g) ?? [], h => parseInt(h, 16)) };
    }
    if (c === '[') {
      const values: PdfValue[] = []; this.skip();
      while (this.text[this.position] !== ']') { values.push(this.read(depth + 1)); this.skip(); }
      this.position++; return values;
    }
    if (c === '<' && this.text[this.position] === '<') {
      this.position++; const dict: PdfDict = Object.create(null); this.skip();
      while (this.text.slice(this.position, this.position + 2) !== '>>') {
        const key = this.read(depth + 1); if (!name(key)) invalid('dictionary key is not a name');
        dict[name(key)] = this.read(depth + 1); this.skip();
      }
      this.position += 2; return dict;
    }
    this.position--; const token = this.word();
    if (token === 'true' || token === 'false') return token === 'true';
    if (token === 'null') return null;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) invalid('contains an invalid object token');
    const value = Number(token); const end = this.position;
    if (/^\d+$/.test(token)) {
      const generation = this.word();
      if (/^\d+$/.test(generation) && this.word() === 'R') return { ref: `${value} ${generation}` };
      this.position = end;
    }
    return value;
  }
}
export function binary(bytes: Uint8Array): string {
  // TextDecoder's latin1 maps bytes 0x80–9f to Unicode, corrupting PDF strings.
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return parts.join('');
}

export class PdfDocument {
  readonly objects = new Map<string, PdfValue>();
  readonly streams = new Map<PdfDict, PdfStream>();
  readonly budget: ExpansionBudget;
  readonly decoded = new Map<PdfDict, Uint8Array>();
  readonly unsupported = new Set<string>();
  readonly work: {used:number;maximum:number};
  catalog?: PdfDict;
  info?: PdfDict;
  constructor(readonly bytes: Uint8Array, readonly limits: ImportSafetyLimits) {
    this.budget = createExpansionBudget(limits, 'A PDF stream');
    this.work = {used:0, maximum:Math.max(1000, limits.maximumEntries * 100)};
    const text = binary(bytes); const reader = new PdfReader(text, this.work.maximum, this.work);
    const headers = /(?:^|[\0\t\n\f\r ])(\d+)\s+(\d+)\s+obj\b/g;
    const objectRanges: {start:number;end:number}[] = [];
    let match: RegExpExecArray | null;
    while ((match = headers.exec(text))) {
      if (this.objects.size >= limits.maximumEntries) limit('has too many indirect objects');
      reader.position = headers.lastIndex; const value = reader.read(); this.objects.set(`${match[1]} ${match[2]}`, value); reader.skip();
      if (isDict(value) && text.slice(reader.position, reader.position + 6) === 'stream') {
        reader.position += 6;
        if (text[reader.position] === '\r') reader.position++;
        if (text[reader.position] === '\n') reader.position++;
        const start = reader.position; const length = number(this.resolve(value.Length), -1);
        let end = length >= 0 ? start + length : text.indexOf('endstream', start);
        if (length >= 0 && !/^[\r\n ]*endstream/.test(text.slice(end, end + 32))) { end = text.indexOf('endstream', start); this.unsupported.add('inconsistent stream length'); }
        if (end < start || end > bytes.length) invalid('stream has no end marker');
        if (length < 0 || this.unsupported.has('inconsistent stream length')) { while (end > start && /[\r\n]/.test(text[end - 1]!)) end--; }
        this.streams.set(value, { dict: value, bytes: bytes.subarray(start, end) });
        const marker = text.indexOf('endstream', end); if (marker < 0) invalid('stream has no end marker');
        headers.lastIndex = marker + 9;
      } else headers.lastIndex = reader.position;
      objectRanges.push({start:match.index,end:headers.lastIndex});
    }
    // Object streams are standard PDF 1.5 containers, not content streams.
    for (const [dict] of this.streams) if (name(dict.Type) === 'ObjStm') {
      const decoded = binary(this.decode(dict)); const first = number(dict.First); const count = number(dict.N);
      if (!Number.isInteger(count) || count < 0 || count + this.objects.size > limits.maximumEntries) limit('object stream has too many objects');
      const header = new PdfReader(decoded.slice(0, first), limits.maximumEntries * 2, this.work);
      for (let i = 0; i < count; i++) {
        const id = number(header.read(), -1), offset = number(header.read(), -1);
        if (id < 0 || offset < 0 || first + offset >= decoded.length) invalid('object stream index is invalid');
        const body = new PdfReader(decoded, this.work.maximum, this.work); body.position = first + offset;
        this.objects.set(`${id} 0`, body.read());
      }
    }
    for (const value of this.objects.values()) if (isDict(value) && name(value.Type) === 'Catalog') this.catalog = value;
    const trailer = /(?:^|[\0\t\n\f\r ])trailer\s*<</g; let trailerMatch: RegExpExecArray | null; let rangeIndex = 0;
    while ((trailerMatch = trailer.exec(text))) {
      while (rangeIndex < objectRanges.length && objectRanges[rangeIndex]!.end <= trailerMatch.index) rangeIndex++;
      if (objectRanges[rangeIndex] && objectRanges[rangeIndex]!.start <= trailerMatch.index) continue;
      reader.position = trailerMatch.index + trailerMatch[0].indexOf('trailer') + 7; const value = reader.read();
      if (isDict(value)) { if (value.Encrypt) invalid('is encrypted and must be unlocked before importing'); const info = this.resolve(value.Info); if (isDict(info)) this.info = info; }
    }
    for (const [dict] of this.streams) if (name(dict.Type) === 'XRef') {
      if (dict.Encrypt) invalid('is encrypted and must be unlocked before importing'); const info = this.resolve(dict.Info); if (isDict(info)) this.info = info;
    }
  }
  resolve(value: PdfValue | undefined): PdfValue | undefined {
    const seen = new Set<string>();
    while (value && typeof value === 'object' && 'ref' in value) {
      const ref = String(value.ref); if (seen.has(ref)) invalid('has a cyclic object reference'); seen.add(ref); value = this.objects.get(ref);
    }
    return value;
  }
  dict(value: PdfValue | undefined): PdfDict | undefined { const resolved = this.resolve(value); return isDict(resolved) ? resolved : undefined; }
  decode(dict: PdfDict): Uint8Array {
    const cached = this.decoded.get(dict); if (cached) return cached;
    const stream = this.streams.get(dict); if (!stream) return new Uint8Array();
    let bytes = stream.bytes; const filters = array(this.resolve(dict.Filter)).map(name);
    if (!filters.length) { reserveExpansion(this.budget, bytes.length); this.budget.expandedBytes += bytes.length; }
    for (const filter of filters) {
      if (filter === 'FlateDecode' || filter === 'Fl') bytes = inflateBounded(bytes, this.budget);
      else { this.unsupported.add(`stream filter ${filter}`); return new Uint8Array(); }
    }
    this.decoded.set(dict, bytes); return bytes;
  }
  pages(): PdfDict[] {
    const pages: PdfDict[] = []; const seen = new Set<PdfDict>();
    const visit = (value: PdfValue | undefined, depth: number) => {
      const dict = this.dict(value); if (!dict) return;
      if (depth > 64 || seen.has(dict)) invalid('page tree is cyclic or too deep'); seen.add(dict);
      if (name(dict.Type) === 'Page') pages.push(dict);
      else for (const kid of array(this.resolve(dict.Kids))) visit(kid, depth + 1);
    };
    visit(this.catalog?.Pages, 0); return pages;
  }
  inherited(page: PdfDict, key: string): PdfValue | undefined {
    const seen = new Set<PdfDict>(); let cursor: PdfDict | undefined = page;
    while (cursor && !seen.has(cursor)) { seen.add(cursor); if (cursor[key] !== undefined) return this.resolve(cursor[key]); cursor = this.dict(cursor.Parent); }
    return undefined;
  }
}
