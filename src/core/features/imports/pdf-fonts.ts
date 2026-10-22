import { PdfDocument, PdfReader, array, binary, limit, name, string, type PdfDict, type PdfString, type PdfValue } from './pdf-objects';

const decoderCache = new WeakMap<PdfDocument, WeakMap<PdfDict, (value: PdfValue) => string>>();

export function pdfFontDecoder(document: PdfDocument, font: PdfDict | undefined): (value: PdfValue) => string {
  if (!font) return createFontDecoder(document, font);
  let fonts = decoderCache.get(document); if (!fonts) { fonts = new WeakMap(); decoderCache.set(document, fonts); }
  const cached = fonts.get(font); if (cached) return cached;
  const decoder = createFontDecoder(document, font); fonts.set(font, decoder); return decoder;
}

/** ToUnicode is authoritative for embedded/subset fonts, including CID fonts. */
function createFontDecoder(document: PdfDocument, font: PdfDict | undefined): (value: PdfValue) => string {
  const mapping = new Map<string, string>(); const lengths = new Set<number>();
  const cmap = document.dict(font?.ToUnicode);
  if (cmap) {
    const contents = binary(document.decode(cmap));
    const unicode = (hex: string) => new TextDecoder('utf-16be').decode(Uint8Array.from(hex.match(/../g) ?? [], h => parseInt(h, 16)));
    for (const section of contents.matchAll(/\d+\s+beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const match of section[1]!.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) { if (++document.work.used > document.work.maximum) limit('font character mapping exceeds the import limit'); mapping.set(match[1]!.toUpperCase(), unicode(match[2]!)); lengths.add(match[1]!.length / 2); }
    }
    for (const section of contents.matchAll(/\d+\s+beginbfrange([\s\S]*?)endbfrange/g)) {
      const reader = new PdfReader(section[1]!, document.work.maximum, document.work);
      while (reader.position < reader.text.length) {
        reader.skip(); if (reader.position >= reader.text.length) break;
        const low = reader.read() as PdfString, high = reader.read() as PdfString, target = reader.read();
        if (!low || !high || !(low.bytes instanceof Uint8Array) || !(high.bytes instanceof Uint8Array) || low.bytes.length > 4 || high.bytes.length > 4) { document.unsupported.add('invalid font character range'); break; }
        const hex = (b: Uint8Array) => Array.from(b, v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
        const first = parseInt(hex(low.bytes), 16), last = parseInt(hex(high.bytes), 16);
        if (last - first > document.limits.maximumEntries) { document.unsupported.add('oversized font character range'); continue; }
        const targets = Array.isArray(target) ? target : undefined;
        const base = !targets && target && typeof target === 'object' && 'bytes' in target && target.bytes instanceof Uint8Array ? hex(target.bytes) : '';
        if (base.length > 16) { document.unsupported.add('oversized font mapping destination'); continue; }
        for (let code = first; code <= last; code++) {
          if (++document.work.used > document.work.maximum) limit('font character mapping exceeds the import limit');
          const mapped = targets?.[code - first];
          const destination = mapped && typeof mapped === 'object' && 'bytes' in mapped && mapped.bytes instanceof Uint8Array ? unicode(hex(mapped.bytes)) : base ? unicode((BigInt(`0x${base}`) + BigInt(code - first)).toString(16).padStart(base.length, '0')) : '';
          mapping.set(code.toString(16).padStart(low.bytes.length * 2, '0').toUpperCase(), destination); lengths.add(low.bytes.length);
        }
      }
    }
  }
  const encoding = document.dict(font?.Encoding); const differences = array(document.resolve(encoding?.Differences));
  const glyphs = new Map<number, string>(); let code = 0;
  const named: Record<string, string> = { space: ' ', hyphen: '-', period: '.', comma: ',', colon: ':', semicolon: ';', parenleft: '(', parenright: ')', ampersand: '&', slash: '/', quotedbl: '"', quotesingle: "'", bullet: '•', endash: '–', emdash: '—', fi: 'fi', fl: 'fl' };
  for (const value of differences) {
    if (typeof value === 'number') code = value;
    else { const glyph = name(value); const decoded = glyph.length === 1 ? glyph : named[glyph] ?? (/^uni[\da-f]{4}$/i.test(glyph) ? String.fromCharCode(parseInt(glyph.slice(3), 16)) : '�'); if (decoded === '�') document.unsupported.add('unmapped font glyph names'); glyphs.set(code++, decoded); }
  }
  const identity = name(font?.Subtype) === 'Type0';
  const encodingName = name(font?.Encoding) || name(encoding?.BaseEncoding);
  const simpleDecoder = new TextDecoder(encodingName === 'MacRomanEncoding' ? 'macintosh' : 'windows-1252');
  if (identity && !mapping.size) document.unsupported.add('CID font without a ToUnicode character map');
  const widths = [...lengths].sort((a, b) => b - a);
  return value => {
    if (!value || typeof value !== 'object' || !('bytes' in value) || !(value.bytes instanceof Uint8Array)) return '';
    const bytes = value.bytes; if (!mapping.size) {
      if (identity) return '�'.repeat(Math.ceil(bytes.length / 2));
      if (!['WinAnsiEncoding','MacRomanEncoding'].includes(encodingName) && bytes.some(byte => byte >= 128 && !glyphs.has(byte))) document.unsupported.add('font encoding without a Unicode map');
      return Array.from(bytes, byte => glyphs.get(byte) ?? simpleDecoder.decode(new Uint8Array([byte]))).join('');
    }
    let text = '';
    for (let offset = 0; offset < bytes.length;) {
      let found = false;
      for (const width of widths) {
        const key = Array.from(bytes.subarray(offset, offset + width), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const mapped = mapping.get(key); if (mapped !== undefined) { text += mapped; offset += width; found = true; break; }
      }
      if (!found) { text += '�'; offset++; document.unsupported.add('unmapped font characters'); }
    }
    return text;
  };
}
