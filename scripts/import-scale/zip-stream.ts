import { createWriteStream } from "node:fs";
import { rename, stat, unlink } from "node:fs/promises";
import { once } from "node:events";
import { createDeflateRaw } from "node:zlib";
import { finished } from "node:stream/promises";
import type { ArchiveEntrySource, GeneratedZipEntry, WrittenZip, WrittenZipEntry } from "./types";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const DATA_DESCRIPTOR = 0x08074b50;
const END_DIRECTORY = 0x06054b50;
const UTF8_AND_DESCRIPTOR = 0x0808;
const FIXED_DOS_DATE = 0x0021;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : current >>> 1;
    table[value] = current >>> 0;
  }
  return table;
})();

function updateCrc(crc: number, chunk: Uint8Array): number {
  let value = crc;
  for (const byte of chunk) value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return value >>> 0;
}

function assertZipPath(path: string) {
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    throw new Error(`Unsafe generated archive path: ${path || "(empty)"}`);
  }
  if (path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Generated archive path escapes its root: ${path}`);
  }
}

function sourceBytes(source: ArchiveEntrySource): AsyncIterable<Uint8Array> {
  if (typeof source === "string") return (async function* () { yield Buffer.from(source, "utf8"); })();
  if (source instanceof Uint8Array) return (async function* () { yield source; })();
  if (Symbol.asyncIterator in Object(source)) return source as AsyncIterable<Uint8Array>;
  return (async function* () { for (const chunk of source as Iterable<Uint8Array>) yield chunk; })();
}

async function writeChunk(stream: ReturnType<typeof createWriteStream>, chunk: Uint8Array) {
  if (chunk.byteLength === 0) return;
  if (!stream.write(chunk)) {
    await new Promise<void>((resolve, reject) => {
      const onDrain = () => { cleanup(); resolve(); };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const cleanup = () => { stream.off("drain", onDrain); stream.off("error", onError); };
      stream.once("drain", onDrain);
      stream.once("error", onError);
    });
  }
}

function u16(value: number): Buffer {
  const bytes = Buffer.allocUnsafe(2);
  bytes.writeUInt16LE(value, 0);
  return bytes;
}

function u32(value: number): Buffer {
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeUInt32LE(value >>> 0, 0);
  return bytes;
}

function localHeader(name: Buffer): Buffer {
  return Buffer.concat([
    u32(LOCAL_HEADER), u16(20), u16(UTF8_AND_DESCRIPTOR), u16(8), u16(0), u16(FIXED_DOS_DATE),
    u32(0), u32(0), u32(0), u16(name.byteLength), u16(0), name,
  ]);
}

function centralHeader(entry: WrittenZipEntry, crc32: number, localOffset: number): Buffer {
  const name = Buffer.from(entry.path, "utf8");
  return Buffer.concat([
    u32(CENTRAL_HEADER), u16(20), u16(20), u16(UTF8_AND_DESCRIPTOR), u16(8), u16(0), u16(FIXED_DOS_DATE),
    u32(crc32), u32(entry.compressedBytes), u32(entry.expandedBytes), u16(name.byteLength), u16(0), u16(0),
    u16(0), u16(0), u32(0), u32(localOffset), name,
  ]);
}

async function writeStreamingZip(path: string, entries: GeneratedZipEntry[]): Promise<WrittenZip> {
  const names = new Set<string>();
  for (const entry of entries) {
    assertZipPath(entry.path);
    if (names.has(entry.path)) throw new Error(`Duplicate generated archive path: ${entry.path}`);
    names.add(entry.path);
  }
  if (entries.length > 0xffff) throw new Error("Classic ZIP supports at most 65,535 generated entries.");

  const stream = createWriteStream(path, { flags: "wx", highWaterMark: 64 * 1024 });
  const streamDone = finished(stream);
  const written: WrittenZipEntry[] = [];
  const crcs: number[] = [];
  const offsets: number[] = [];
  let offset = 0;
  let expandedBytes = 0;

  const write = async (chunk: Uint8Array) => {
    await writeChunk(stream, chunk);
    offset += chunk.byteLength;
  };

  try {
    for (const entry of entries) {
      const name = Buffer.from(entry.path, "utf8");
      offsets.push(offset);
      await write(localHeader(name));

      const compressor = createDeflateRaw({ level: 6 });
      let crc = 0xffffffff;
      let entryExpanded = 0;
      let entryCompressed = 0;
      const compressedDone = (async () => {
        for await (const chunk of compressor) {
          const bytes = chunk as Buffer;
          entryCompressed += bytes.byteLength;
          await write(bytes);
        }
      })();

      for await (const chunk of sourceBytes(entry.source)) {
        if (!(chunk instanceof Uint8Array)) throw new Error(`Generated entry ${entry.path} yielded non-byte data.`);
        if (!chunk.byteLength) continue;
        crc = updateCrc(crc, chunk);
        entryExpanded += chunk.byteLength;
        if (!compressor.write(chunk)) await once(compressor, "drain");
      }
      compressor.end();
      await compressedDone;
      const ratio = entryExpanded ? entryExpanded / Math.max(entryCompressed, 1) : 0;
      if (ratio > MAX_COMPRESSION_RATIO) throw new Error("Generated ZIP entry exceeds the import compression-ratio limit: " + entry.path);
      const finalCrc = (crc ^ 0xffffffff) >>> 0;
      await write(Buffer.concat([u32(DATA_DESCRIPTOR), u32(finalCrc), u32(entryCompressed), u32(entryExpanded)]));
      const item = { path: entry.path, expandedBytes: entryExpanded, compressedBytes: entryCompressed };
      written.push(item);
      crcs.push(finalCrc);
      expandedBytes += entryExpanded;
    }

    const centralOffset = offset;
    for (let index = 0; index < written.length; index += 1) {
      const header = centralHeader(written[index]!, crcs[index]!, offsets[index]!);
      await write(header);
    }
    const centralBytes = offset - centralOffset;
    await write(Buffer.concat([
      u32(END_DIRECTORY), u16(0), u16(0), u16(written.length), u16(written.length),
      u32(centralBytes), u32(centralOffset), u16(0),
    ]));
    if (offset > MAX_ARCHIVE_BYTES) throw new Error("Generated ZIP exceeds the import source archive byte limit.");
    stream.end();
    await streamDone;
  } catch (error) {
    stream.destroy(error as Error);
    await streamDone.catch(() => undefined);
    throw error;
  }

  const compressedBytes = written.reduce((total, entry) => total + entry.compressedBytes, 0);
  const maxFileBytes = written.reduce((maximum, entry) => Math.max(maximum, entry.expandedBytes), 0);
  const maximumCompressionRatio = written.reduce((maximum, entry) => entry.expandedBytes
    ? Math.max(maximum, entry.expandedBytes / Math.max(entry.compressedBytes, 1))
    : maximum, 0);
  return {
    archiveBytes: (await stat(path)).size,
    compressedBytes,
    expandedBytes,
    maxFileBytes,
    maximumCompressionRatio,
    entries: written,
  };
}

export async function writeZipArchive(path: string, entries: GeneratedZipEntry[]): Promise<WrittenZip> {
  const partialPath = `${path}.partial-${process.pid}`;
  await unlink(partialPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  try {
    const result = await writeStreamingZip(partialPath, entries);
    await rename(partialPath, path);
    return result;
  } catch (error) {
    await unlink(partialPath).catch(() => undefined);
    throw error;
  }
}

export async function* deterministicPayload(byteLength: number, seed: number): AsyncGenerator<Uint8Array> {
  const chunkSize = 64 * 1024;
  const bytesPerPattern = 16;
  const repeats = 4;
  const bytesPerUnit = bytesPerPattern * repeats;
  const pattern = Buffer.allocUnsafe(bytesPerPattern);
  let state = seed >>> 0 || 0x5a17c9e3;
  let remaining = byteLength;

  while (remaining > 0) {
    const size = Math.min(chunkSize, remaining);
    const output = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      for (let index = 0; index < bytesPerPattern; index += 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        // Text attachments are an admitted Notion media type. Keep every
        // payload byte valid UTF-8 ASCII while retaining enough deterministic
        // entropy that a 64 MiB boundary entry stays well below ratio 100.
        pattern[index] = 32 + ((state >>> 0) % 95);
      }
      const copyBytes = Math.min(bytesPerUnit, size - offset);
      for (let index = 0; index < copyBytes; index += 1) output[offset + index] = pattern[index % bytesPerPattern]!;
      offset += copyBytes;
    }
    remaining -= size;
    yield output;
  }
}
