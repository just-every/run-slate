export type S3Destination = { endpoint: string; region: string; bucket: string };
export type S3Credentials = { accessKeyId: string; secretAccessKey: string };
export type S3Query = readonly (readonly [string, string])[];

const encoder = new TextEncoder();
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

async function digest(value: Uint8Array<ArrayBuffer>) {
  return hex(await crypto.subtle.digest('SHA-256', value));
}

async function hmac(key: Uint8Array<ArrayBuffer>, value: string) {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(value)));
}

/** Sign precisely the path and query that fetch will send; S3 does not normalize object keys. */
export async function signS3Request(destination: S3Destination, credentials: S3Credentials, method: string,
  key: string | undefined, query: S3Query, body?: Uint8Array<ArrayBuffer>, additionalHeaders?: Record<string, string>) {
  const url = new URL(destination.endpoint);
  const path = `${url.pathname.replace(/\/+$/, '')}/${encode(destination.bucket)}${key === undefined ? '' : `/${key.split('/').map(encode).join('/')}`}`;
  url.pathname = path;
  // URL/fetch would silently change dot-only path segments, addressing a different object.
  if (url.pathname !== path) throw new Error('Unrepresentable object path');
  const pairs = query.map(([name, value]) => [encode(name), encode(value)] as const)
    .sort(([a, av], [b, bv]) => compare(a, b) || compare(av, bv));
  const canonicalQuery = pairs.map(([name, value]) => `${name}=${value}`).join('&');
  url.search = canonicalQuery;
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = timestamp.slice(0, 8);
  const payloadHash = await digest(body ?? new Uint8Array());
  const headers = new Headers(additionalHeaders);
  headers.set('host', url.host);
  headers.set('x-amz-date', timestamp);
  headers.set('x-amz-content-sha256', payloadHash);
  const names = [...headers.keys()].sort(compare);
  const signedHeaders = names.join(';');
  const canonicalHeaders = names.map(name => `${name}:${headers.get(name)!.trim().replace(/\s+/g, ' ')}\n`).join('');
  const canonical = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${day}/${destination.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${await digest(encoder.encode(canonical))}`;
  let signingKey = await hmac(encoder.encode(`AWS4${credentials.secretAccessKey}`), day);
  signingKey = await hmac(signingKey, destination.region);
  signingKey = await hmac(signingKey, 's3');
  signingKey = await hmac(signingKey, 'aws4_request');
  const signature = hex((await hmac(signingKey, stringToSign)).buffer);
  headers.set('authorization', `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`);
  return { url, headers };
}
