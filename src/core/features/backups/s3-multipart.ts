import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { ApiProblem } from '../../app/problems';

export const S3_PART_BYTES = 5 * 1024 * 1024;
export const providerFailure = () => new ApiProblem(502, 'BACKUP_PROVIDER_FAILED', 'The backup storage request could not be completed.');

/** A single part buffer plus the current source chunk, independent of archive size. */
export async function* objectParts(object: R2ObjectBody): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const reader = (() => {
    try { return object.body.getReader(); }
    catch { throw providerFailure(); }
  })();
  let remaining = object.size;
  let pending: Uint8Array = new Uint8Array();
  let offset = 0;
  try {
    do {
      const part = new Uint8Array(Math.min(remaining, S3_PART_BYTES));
      let filled = 0;
      while (filled < part.length) {
        if (offset === pending.length) {
          const next = await reader.read();
          if (next.done || !next.value) throw providerFailure();
          pending = next.value;
          offset = 0;
        }
        const count = Math.min(part.length - filled, pending.length - offset);
        part.set(pending.subarray(offset, offset + count), filled);
        offset += count;
        filled += count;
      }
      remaining -= part.length;
      if (!remaining) {
        if (offset !== pending.length) throw providerFailure();
        // Detect a source that changed or whose advertised size was truncated before committing.
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          if (next.value.length) throw providerFailure();
        }
      }
      yield part;
    } while (remaining);
  } catch {
    throw providerFailure();
  } finally {
    try { await reader.cancel(); } catch { /* The transport failure is already reported safely. */ }
    reader.releaseLock();
  }
}

/** Bound provider XML and disallow declarations/entities supplied by a remote server. */
export async function providerXml(response: Response, root: string): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw providerFailure();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 128 * 1024) throw providerFailure();
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
    if (/<!/i.test(text) || /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/i.test(text) || XMLValidator.validate(text) !== true) throw providerFailure();
    const parsed = new XMLParser({ ignoreAttributes: true, ignoreDeclaration: true, removeNSPrefix: true,
      parseTagValue: false, trimValues: false, processEntities: true, htmlEntities: false }).parse(text);
    if (!parsed || Object.keys(parsed).length !== 1 || !parsed[root] || typeof parsed[root] !== 'object' || Array.isArray(parsed[root])) throw providerFailure();
    // CompleteMultipartUpload can report an error inside an HTTP 200 response.
    if ('Error' in parsed[root]) throw providerFailure();
    return parsed[root];
  } catch {
    throw providerFailure();
  } finally {
    try { await reader.cancel(); } catch { /* Do not expose a provider stream error. */ }
    reader.releaseLock();
  }
}

export function xmlString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) throw providerFailure();
  return value;
}

const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);

export function completionBody(parts: { partNumber: number; etag: string }[]) {
  return new TextEncoder().encode(`<CompleteMultipartUpload>${parts.map(part => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`);
}
