import assert from 'node:assert/strict';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const s3Fixture = Object.freeze({
  endpoint: 'https://synthetic-slate-1.example.test', region: 'us-east-1', bucket: 'synthetic-slate-3',
  accessKeyId: 'synthetic-slate-101', secretAccessKey: 'synthetic-slate-102',
  unrelatedKey: 'other-workspace/keep.txt',
});
const file = (directory, name) => path.join(directory, `s3-${name}`);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
async function atomicJson(filename, value) {
  await writeFile(filename + '.new', JSON.stringify(value));
  await rename(filename + '.new', filename);
}
export async function setS3Failure(directory, failure = 'ok') {
  assert.ok(['ok', 'forbidden'].includes(failure), 'Unknown S3 edge failure');
  await atomicJson(file(directory, 'control.json'), { failure });
}
export async function initializeS3Edge(directory) {
  await atomicJson(file(directory, 'objects.json'), { [s3Fixture.unrelatedKey]: Buffer.from('Another workspace owns this object.').toString('base64') });
  await writeFile(file(directory, 'requests.jsonl'), '');
  await setS3Failure(directory);
}
export async function readS3Requests(directory) {
  return (await readFile(file(directory, 'requests.jsonl'), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
}
export async function readS3Objects(directory) {
  const objects = JSON.parse(await readFile(file(directory, 'objects.json'), 'utf8'));
  return Object.fromEntries(Object.entries(objects).map(([key, bytes]) => [key, Buffer.from(bytes, 'base64')]));
}

/** Independent Node HMAC verification of the actual outbound AWS request, without production signer imports. */
function verifySignature(request, body) {
  const url = new URL(request.url);
  const match = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '');
  assert.ok(match, 'S3 request must carry AWS SigV4 authorization');
  const [, accessKey, day, region, signedHeaders, signature] = match;
  assert.equal(accessKey, s3Fixture.accessKeyId, 'Unexpected synthetic S3 access key');
  assert.equal(region, s3Fixture.region);
  const timestamp = request.headers.get('x-amz-date');
  assert.match(timestamp ?? '', /^\d{8}T\d{6}Z$/);
  assert.equal(timestamp.slice(0, 8), day);
  assert.equal(request.headers.get('host'), url.host);
  assert.equal(request.headers.get('x-amz-content-sha256'), hash(body), 'Signed payload must match the uploaded bytes');
  const names = signedHeaders.split(';');
  assert.deepEqual(names, [...new Set(names)].sort());
  for (const required of ['host', 'x-amz-date', 'x-amz-content-sha256']) assert.ok(names.includes(required));
  if (request.headers.has('if-none-match')) assert.ok(names.includes('if-none-match'), 'Conditional writes must be signed');
  const query = [...url.searchParams].map(([key, value]) => [encode(key), encode(value)])
    .sort(([a, av], [b, bv]) => compare(a, b) || compare(av, bv)).map(pair => pair.join('=')).join('&');
  const headers = names.map(name => {
    assert.ok(request.headers.has(name), `Missing signed S3 header ${name}`);
    return `${name}:${request.headers.get(name).trim().replace(/\s+/g, ' ')}\n`;
  }).join('');
  const canonical = [request.method, url.pathname, query, headers, signedHeaders, hash(body)].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  let key = hmac(`AWS4${s3Fixture.secretAccessKey}`, day);
  for (const part of [region, 's3', 'aws4_request']) key = hmac(key, part);
  const expected = hmac(key, `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`);
  assert.ok(timingSafeEqual(expected, Buffer.from(signature, 'hex')), 'S3 signature must authenticate the exact outbound request');
}

/** Fake only the synthetic public HTTPS S3 network boundary. Objects are real bytes, not application responses. */
export async function s3Edge(request, directory, ResponseClass) {
  const url = new URL(request.url);
  if (url.origin !== s3Fixture.endpoint) return null;
  let control;
  try { control = JSON.parse(await readFile(file(directory, 'control.json'), 'utf8')); }
  catch (cause) { if (cause.code === 'ENOENT') throw new Error('S3 edge was not initialized'); throw cause; }
  const body = Buffer.from(await request.arrayBuffer());
  verifySignature(request, body);
  const [bucket, ...segments] = url.pathname.slice(1).split('/').map(decodeURIComponent);
  assert.equal(bucket, s3Fixture.bucket, 'S3 request must address the configured bucket');
  assert.equal(url.search, '', 'This small-archive browser journey must not list objects or invoke multipart operations');
  const key = segments.join('/');
  await appendFile(file(directory, 'requests.jsonl'), JSON.stringify({ method: request.method, key, size: body.length,
    sha256: hash(body), signatureVerified: true, failure: control.failure }) + '\n');
  if (control.failure === 'forbidden') return new ResponseClass(null, { status: 403 });
  if (request.method === 'HEAD' && !key) return new ResponseClass(null, { status: 200 });
  assert.ok(key, 'Only HEAD may address the bucket root');
  const filename = file(directory, 'objects.json');
  const objects = JSON.parse(await readFile(filename, 'utf8'));
  if (request.method === 'PUT') {
    assert.equal(request.headers.get('if-none-match'), '*', 'Backup objects must use conditional creation');
    if (Object.hasOwn(objects, key)) return new ResponseClass(null, { status: 412 });
    objects[key] = body.toString('base64');
    await atomicJson(filename, objects);
    return new ResponseClass(null, { status: 200 });
  }
  if (request.method === 'GET') {
    if (!Object.hasOwn(objects, key)) return new ResponseClass(null, { status: 404 });
    const bytes = Buffer.from(objects[key], 'base64');
    return new ResponseClass(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) } });
  }
  if (request.method === 'DELETE') {
    delete objects[key];
    await atomicJson(filename, objects);
    return new ResponseClass(null, { status: 204 });
  }
  throw new Error(`Unexpected S3 edge method ${request.method}`);
}
