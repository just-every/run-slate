import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const marker = Buffer.from('Slate synthetic fixture v1');

// Padding retains incumbent byte lengths without introducing arbitrary binary
// strings that textual publication scanners can mistake for personal data.
export function assertPublicImagePadding(bytes, format) {
  const payloads = [];
  if (format === 'PNG') {
    let cursor = 8;
    while (cursor < bytes.length) {
      const length = bytes.readUInt32BE(cursor);
      assert.ok(cursor + length + 12 <= bytes.length, 'complete PNG chunk');
      if (bytes.subarray(cursor + 4, cursor + 8).toString('ascii') === 'fiXt') {
        payloads.push(bytes.subarray(cursor + 8, cursor + 8 + length));
      }
      cursor += length + 12;
    }
    assert.equal(cursor, bytes.length, 'PNG chunks cover the image');
  } else {
    let cursor = 2;
    while (cursor < bytes.length) {
      assert.equal(bytes[cursor], 0xff, 'JPEG segment marker');
      const type = bytes[cursor + 1];
      if (type === 0xda) break;
      const length = bytes.readUInt16BE(cursor + 2);
      assert.ok(cursor + length + 2 <= bytes.length, 'complete JPEG segment');
      if (type === 0xfe) {
        const payload = bytes.subarray(cursor + 4, cursor + length + 2);
        assert.ok(payload.subarray(0, marker.length).equals(marker), 'synthetic JPEG comment');
        payloads.push(payload.subarray(marker.length));
      }
      cursor += length + 2;
    }
  }
  assert.ok(payloads.length > 0, 'synthetic image retains padding');
  for (const payload of payloads) {
    assert.ok(payload.length > 0, 'padding is not empty');
    // Validate bytes rather than ASCII decoding, which can mask high bits.
    assert.ok(payload.every(byte => byte === 0x0a || (byte >= 0x30 && byte <= 0x39) || (byte >= 0x61 && byte <= 0x66)),
      'padding uses only lowercase hexadecimal bytes and line breaks, excluding email syntax');
    assert.ok(payload.toString('ascii').split('\n').every(line => line.length <= 64),
      'hexadecimal lines stay bounded for textual publication inspection');
    for (let offset = 0, counter = 0; offset < payload.length; offset += 65, counter++) {
      const line = Buffer.from(createHash('sha256').update(`Slate synthetic padding v2:${counter}`).digest('hex') + '\n');
      assert.ok(payload.subarray(offset, offset + 65).equals(line.subarray(0, Math.min(65, payload.length - offset))),
        'padding retains deterministic SHA-256 counter lines');
    }
  }
}
