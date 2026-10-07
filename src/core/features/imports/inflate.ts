import { Gunzip, Unzlib } from "fflate";
import { ImportError } from "./errors";
import type { ImportSafetyLimits } from "./types";

/**
 * Decompression is always streamed against a budget. An archive entry that is
 * itself compressed — a PDF Flate stream, a gzipped Confluence table — can hold
 * a bomb that the containing archive's own limits never saw, so every chunk is
 * counted as it arrives. Compressed input is sliced too: fflate expands a whole
 * push before calling onData, so passing an entire bomb defeats an output check.
 * The fixed input window bounds decoder scratch and output before each check.
 */

export interface ExpansionBudget {
  expandedBytes: number;
  maximumExpandedBytes: number;
  maximumEntryBytes: number;
  maximumCompressionRatio: number;
  what: string;
}

export function createExpansionBudget(limits: ImportSafetyLimits, what: string): ExpansionBudget {
  return {
    expandedBytes: 0,
    maximumExpandedBytes: limits.maximumExpandedBytes,
    maximumEntryBytes: limits.maximumEntryBytes,
    maximumCompressionRatio: limits.maximumCompressionRatio,
    what,
  };
}

export function reserveExpansion(budget: ExpansionBudget, bytes: number, compressedBytes?: number) {
  if (bytes > budget.maximumEntryBytes || budget.expandedBytes + bytes > budget.maximumExpandedBytes) {
    throw new ImportError("IMPORT_ARCHIVE_LIMIT_EXCEEDED", `${budget.what} expands beyond the import safety limit.`);
  }
  if (compressedBytes !== undefined && (compressedBytes === 0 || bytes / compressedBytes > budget.maximumCompressionRatio)) {
    throw new ImportError("IMPORT_ARCHIVE_COMPRESSION_RATIO", `${budget.what} exceeds the maximum compression ratio.`);
  }
}

// A DEFLATE match emits at most 258 bytes from at least two bits. With at
// most 68 new input bytes per push, even maximum-ratio data cannot allocate an
// unbounded output before onData runs. An incomplete stored block can also be
// buffered, but its format caps its payload at 65,535 bytes. Dynamic Huffman
// headers and the decoder's 32KiB history likewise have fixed bounds.
const COMPRESSED_CHUNK_BYTES = 64;
const ZLIB_TRAILER_BYTES = 4;

type StreamingInflate = { push(chunk: Uint8Array, final: boolean): void };

function bounded(create: (onData: (chunk: Uint8Array) => void) => StreamingInflate, bytes: Uint8Array, budget: ExpansionBudget): Uint8Array {
  const parts: Uint8Array[] = [];
  let streamBytes = 0;
  try {
    const stream = create((chunk) => {
      streamBytes += chunk.byteLength;
      reserveExpansion(budget, streamBytes, bytes.byteLength);
      if (chunk.byteLength) parts.push(chunk);
    });
    // Keep the zlib checksum together in the final push; Unzlib removes its
    // four bytes only when final is true. The final slice is at most 68 bytes.
    let offset = 0;
    while (bytes.byteLength - offset > COMPRESSED_CHUNK_BYTES + ZLIB_TRAILER_BYTES) {
      stream.push(bytes.subarray(offset, offset + COMPRESSED_CHUNK_BYTES), false);
      offset += COMPRESSED_CHUNK_BYTES;
    }
    stream.push(bytes.subarray(offset), true);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("IMPORT_FORMAT_INVALID", `${budget.what} is malformed.`);
  }
  budget.expandedBytes += streamBytes;
  const output = new Uint8Array(streamBytes);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

/** zlib / raw deflate, as a PDF `/FlateDecode` stream carries it. */
export function inflateBounded(bytes: Uint8Array, budget: ExpansionBudget): Uint8Array {
  return bounded((onData) => new Unzlib(onData), bytes, budget);
}

/** gzip members, as a Confluence Cloud export names (but does not always use). */
export function gunzipBounded(bytes: Uint8Array, budget: ExpansionBudget): Uint8Array {
  return bounded((onData) => new Gunzip(onData), bytes, budget);
}

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}
