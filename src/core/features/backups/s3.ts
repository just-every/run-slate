import { ApiProblem } from '../../app/problems';
import { completionBody, objectParts, providerFailure, providerXml, S3_PART_BYTES, xmlString } from './s3-multipart';
import { signS3Request, type S3Credentials, type S3Destination, type S3Query } from './s3-signature';

/** Path-style S3 transport. Credentials and provider responses stay inside this boundary. */
export class BackupS3 {
  private readonly destination: S3Destination;
  private readonly credentials: S3Credentials;

  constructor(destination: S3Destination, credentials: S3Credentials, private readonly authorize?: () => Promise<void>) {
    this.destination = { ...destination };
    this.credentials = { ...credentials };
  }

  private async request(method: string, key?: string, query: S3Query = [], body?: Uint8Array<ArrayBuffer>, extraHeaders?: Record<string, string>) {
    let signed: Awaited<ReturnType<typeof signS3Request>>;
    try { signed = await signS3Request(this.destination, this.credentials, method, key, query, body, extraHeaders); }
    catch { throw providerFailure(); }
    // Recheck credential custody, owner authority and destination epoch before every network effect.
    await this.authorize?.();
    let response: Response;
    try { response = await fetch(signed.url, { method, headers: signed.headers, body, redirect: 'manual' }); }
    catch { throw providerFailure(); }
    const expectedStatus = method === 'DELETE' ? response.status === 200 || response.status === 204 : response.status === 200;
    if (!response.ok || !expectedStatus) {
      await this.discard(response);
      if (response.status === 401 || response.status === 403) throw new ApiProblem(403, 'BACKUP_DESTINATION_FORBIDDEN', 'The backup destination did not authorize this request.');
      if (response.status === 409 || response.status === 412) throw new ApiProblem(409, 'BACKUP_OBJECT_CONFLICT', 'The backup object conflicts with an existing object.');
      throw providerFailure();
    }
    return response;
  }

  private async discard(response: Response) {
    try { await response.body?.cancel(); } catch { /* Never propagate provider diagnostics. */ }
  }

  async test(): Promise<void> {
    await this.discard(await this.request('HEAD'));
  }

  async upload(key: string, object: R2ObjectBody): Promise<void> {
    if (!Number.isSafeInteger(object.size) || object.size < 0 || Math.ceil(object.size / S3_PART_BYTES) > 10_000) throw providerFailure();
    if (object.size <= S3_PART_BYTES) {
      for await (const part of objectParts(object)) {
        await this.discard(await this.request('PUT', key, [], part, { 'if-none-match': '*', 'content-type': 'application/octet-stream' }));
      }
      return;
    }
    const created = await this.request('POST', key, [['uploads', '']]);
    const uploadId = xmlString((await providerXml(created, 'InitiateMultipartUploadResult')).UploadId);
    const query = [['uploadId', uploadId]] as const;
    try {
      const parts: { partNumber: number; etag: string }[] = [];
      for await (const part of objectParts(object)) {
        const partNumber = parts.length + 1;
        const response = await this.request('PUT', key, [...query, ['partNumber', String(partNumber)]], part);
        const etag = response.headers.get('etag');
        await this.discard(response);
        parts.push({ partNumber, etag: xmlString(etag) });
      }
      const response = await this.request('POST', key, query, completionBody(parts), { 'if-none-match': '*', 'content-type': 'application/xml' });
      xmlString((await providerXml(response, 'CompleteMultipartUploadResult')).ETag);
    } catch (cause) {
      // Only this operation's upload is ever aborted; never delete or list bucket objects.
      try { await this.discard(await this.request('DELETE', key, query)); } catch { /* Preserve the original safe failure, including revoked authority. */ }
      throw cause;
    }
  }

  async read(key: string): Promise<Response> {
    const response = await this.request('GET', key);
    if (response.status !== 200) { await this.discard(response); throw providerFailure(); }
    const headers = new Headers({ 'content-type': 'application/octet-stream' });
    const length = response.headers.get('content-length');
    if (length && /^\d+$/.test(length)) headers.set('content-length', length);
    const reader = response.body?.getReader();
    const body = reader ? new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) { controller.close(); reader.releaseLock(); }
          else controller.enqueue(next.value);
        } catch {
          controller.error(providerFailure());
          try { await reader.cancel(); } catch { /* Keep provider stream diagnostics private. */ }
          reader.releaseLock();
        }
      },
      async cancel() {
        try { await reader.cancel(); } catch { /* Cancellation must not expose provider diagnostics. */ }
        reader.releaseLock();
      },
    }) : null;
    return new Response(body, { status: 200, headers });
  }

  async remove(key: string): Promise<void> {
    await this.discard(await this.request('DELETE', key));
  }
}
