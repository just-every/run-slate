import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {assertPublicImagePadding} from './fixture-padding.mjs';

const policy = JSON.parse(readFileSync(new URL('./fixture-policy.json', import.meta.url)));

// Read the central directory, including stored CSV parts, without depending on
// the importer's own ZIP reader. This keeps the publication policy independent.
function entries(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, 'ZIP end record');
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  const result = [];
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = bytes.subarray(start, start + compressed);
    assert.ok(method === 0 || method === 8, `supported method: ${name}`);
    const content = method === 0 ? data : inflateRawSync(data);
    assert.equal(content.length, size);
    assert.ok(size === 0 || (compressed > 0 && size / compressed <= 100), `existing importer compression safety: ${name}`);
    result.push({name, compression: method, content});
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

function imageDimensions(bytes, format) {
  if (format === 'PNG') {
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  let cursor = 2;
  while (cursor < bytes.length) {
    assert.equal(bytes[cursor++], 0xff);
    const marker = bytes[cursor++];
    const length = bytes.readUInt16BE(cursor);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [bytes.readUInt16BE(cursor + 5), bytes.readUInt16BE(cursor + 3)];
    cursor += length;
  }
  throw new Error('Missing JPEG frame');
}

function assertSyntheticWordIdentities(parts) {
  const xml = name => parts.find(entry => entry.name === name).content.toString('utf8');
  const authors = [...xml('docProps/core.xml').matchAll(/<(?:dc:creator|cp:lastModifiedBy)>([^<]*)<\//g)];
  assert.equal(authors.length, 2, 'Word creator and editor properties remain present');
  for (const [, name] of authors) assert.equal(name, 'Fixture Editor', 'synthetic Word author');

  const members = [...xml('customXml/item1.xml').matchAll(/<(?:\w+:)?DisplayName>([^<]*)<\//g)];
  assert.equal(members.length, 17, 'Word custom XML member display fields remain present');
  for (const [, name] of members) assert.match(name, /^Example Member \d+$/, 'synthetic Word member');

  const shared = [...xml('docProps/custom.xml').matchAll(/<property\b[^>]*\bname="SharedWithUsers"[^>]*>\s*<vt:lpwstr>([^<]*)<\/vt:lpwstr>\s*<\/property>/g)];
  assert.equal(shared.length, 1, 'Word shared-member property and string type remain present');
  const values = shared[0][1].split(';#');
  assert.equal(values.length, 12, 'six shared members retain their ID/display delimiters');
  assert.deepEqual(values.filter((_, index) => index % 2 === 0), ['5476', '116', '329', '2209', '124', '2229']);
  assert.deepEqual(values.filter((_, index) => index % 2 === 1),
    Array.from({length: 6}, (_, index) => `Example Member ${index + 1}`), 'synthetic shared-member display values');
}

test('public fixture policy preserves every reviewed archive', () => {
  for (const archive of policy.archives) {
    const bytes = readFileSync(archive.path);
    const actual = entries(bytes);
    if (actual.some(entry => entry.name === 'docProps/custom.xml')) assertSyntheticWordIdentities(actual);
    assert.deepEqual(actual.map(({name, compression}) => ({name, compression})),
      archive.entries.map(({name, compression}) => ({name, compression})), 'member order, names and methods');
    for (const [index, entry] of actual.entries()) {
      const expected = archive.entries[index];
      assert.equal(entry.content.length, expected.bytes, entry.name);
      if (expected.image) {
        assert.ok(entry.content.includes(Buffer.from('Slate synthetic fixture v1')), 'synthetic identity marker');
        assert.deepEqual(imageDimensions(entry.content, expected.image.format), [expected.image.width, expected.image.height]);
        assert.equal(entry.content.length, expected.image.bytes, 'retained image byte size');
        assertPublicImagePadding(entry.content, expected.image.format);
      } else {
        assert.ok(!entry.content.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')));
        assert.notEqual(entry.content.readUInt16BE(0), 0xffd8, 'unregistered JPEG');
        const text = entry.content.toString('utf8');
        assert.doesNotMatch(text, /instagram|cajunkoi|senja\.io|mattygrov|Hey! It’s Matty|Dr\. Matty/i);
        for (const match of text.matchAll(/(?:https?:\/\/|\/\/(?=[A-Za-z0-9.-]+\.[A-Za-z]{2,}\/))[^\s<>"')\]]+/g)) {
          const url = match[0];
          const host = new URL(url.startsWith('//') ? `https:${url}` : url).hostname;
          const namespace = archive.path.endsWith('.docx') && /^(schemas\.|www\.w3\.org$|purl\.org$|dublincore\.org$)/.test(host);
          // Exact exporter relation targets preserve field inference; licensed
          // government citations preserve the publisher's source references.
          assert.ok(namespace || archive.semanticExternalUrls.includes(url) || /(^|\.)example\.(com|org|test)$/.test(host), `reviewed external fixture URL: ${host}`);
        }
        if (entry.name.endsWith('.csv.gz')) assert.notEqual(entry.content.readUInt16BE(0), 0x1f8b, 'exporter plain CSV remains plain');
      }
    }
  }
});
