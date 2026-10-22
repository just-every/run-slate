import { zlibSync } from 'fflate';
import { reserveExpansion } from './inflate';
import { PdfDocument, array, limit, name, number, type PdfDict } from './pdf-objects';

function uint32(value: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value); return b; }
function concat(parts: Uint8Array[]): Uint8Array { const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0)); let i = 0; for (const b of parts) { out.set(b, i); i += b.length; } return out; }
function chunk(type: string, data: Uint8Array): Uint8Array {
  const payload = concat([new TextEncoder().encode(type), data]); let crc = 0xffffffff;
  for (const byte of payload) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return concat([uint32(data.length), payload, uint32((crc ^ 0xffffffff) >>> 0)]);
}
function samples(document: PdfDocument, dict: PdfDict, width: number, height: number, components: number): Uint8Array | undefined {
  const data = document.decode(dict); const parameters = document.dict(Array.isArray(dict.DecodeParms) ? dict.DecodeParms.at(-1) : dict.DecodeParms);
  const predictor = number(document.resolve(parameters?.Predictor), 1); const rowBytes = width * components;
  if (predictor === 1) return data.length >= rowBytes * height ? data.subarray(0, rowBytes * height) : undefined;
  const out = new Uint8Array(rowBytes * height);
  if (predictor === 2 && data.length >= out.length) {
    out.set(data.subarray(0, out.length)); for (let y = 0; y < height; y++) for (let x = components; x < rowBytes; x++) out[y * rowBytes + x] = (out[y * rowBytes + x]! + out[y * rowBytes + x - components]!) & 255;
    return out;
  }
  if (predictor < 10 || predictor > 15 || data.length < (rowBytes + 1) * height) return undefined;
  for (let y = 0; y < height; y++) {
    const filter = data[y * (rowBytes + 1)]!; if (filter > 4) return undefined;
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= components ? out[y * rowBytes + x - components]! : 0;
      const up = y ? out[(y - 1) * rowBytes + x]! : 0;
      const upperLeft = y && x >= components ? out[(y - 1) * rowBytes + x - components]! : 0;
      const p = left + up - upperLeft, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
      const predicted = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? a <= b && a <= c ? left : b <= c ? up : upperLeft : 0;
      out[y * rowBytes + x] = (data[y * (rowBytes + 1) + 1 + x]! + predicted) & 255;
    }
  }
  return out;
}
/** Preserve JPEG payloads; losslessly package supported raw image samples as PNG. */
export function pdfImage(document: PdfDocument, dict: PdfDict): { bytes: Uint8Array; mediaType: string; extension: string } | undefined {
  if (!document.streams.has(dict)) { document.unsupported.add('image without a stream'); return; }
  const filters = array(document.resolve(dict.Filter)).map(name);
  if (filters.length === 1 && ['DCTDecode', 'DCT'].includes(filters[0]!)) {
    if (dict.SMask || dict.Mask || dict.Decode) document.unsupported.add('JPEG mask or decode transform');
    const bytes = document.streams.get(dict)?.bytes; if (!bytes) return;
    reserveExpansion(document.budget, bytes.length); document.budget.expandedBytes += bytes.length;
    return { bytes, mediaType: 'image/jpeg', extension: 'jpg' };
  }
  const width = number(document.resolve(dict.Width)), height = number(document.resolve(dict.Height)), colour = name(document.resolve(dict.ColorSpace));
  const components = colour === 'DeviceRGB' ? 3 : colour === 'DeviceGray' ? 1 : 0;
  if (!components || number(document.resolve(dict.BitsPerComponent)) !== 8 || dict.ImageMask === true || dict.Decode || dict.Mask) { document.unsupported.add('image colour space, mask or bit depth'); return; }
  const length = width * height * 4;
  if (!Number.isSafeInteger(length) || width < 1 || height < 1 || length > document.limits.maximumEntryBytes) limit('image dimensions exceed the import limit');
  reserveExpansion(document.budget, length); document.budget.expandedBytes += length;
  const data = samples(document, dict, width, height, components); if (!data) { document.unsupported.add('image sample predictor'); return; }
  const alphaDict = document.dict(dict.SMask);
  const alpha = alphaDict && number(document.resolve(alphaDict.Width)) === width && number(document.resolve(alphaDict.Height)) === height && number(document.resolve(alphaDict.BitsPerComponent)) === 8 && name(document.resolve(alphaDict.ColorSpace)) === 'DeviceGray' ? samples(document, alphaDict, width, height, 1) : undefined;
  if (alphaDict && !alpha) { document.unsupported.add('image soft mask'); return; }
  const channels = alpha ? components + 1 : components; const scanlines = new Uint8Array((width * channels + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const to = y * (width * channels + 1) + 1 + x * channels, from = (y * width + x) * components;
    scanlines.set(data.subarray(from, from + components), to); if (alpha) scanlines[to + components] = alpha[y * width + x]!;
  }
  const header = concat([uint32(width), uint32(height), new Uint8Array([8, alpha ? components === 3 ? 6 : 4 : components === 3 ? 2 : 0, 0, 0, 0])]);
  return { bytes: concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlibSync(scanlines)), chunk('IEND', new Uint8Array())]), mediaType: 'image/png', extension: 'png' };
}
