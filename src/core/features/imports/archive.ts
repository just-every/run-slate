import { unzipSync } from "fflate";
import { ImportError } from "./errors";
import { importSafetyLimits } from "./safety";
import type { ImportSafetyLimits } from "./types";

interface ZipDirectoryEntry {
  path: string;
  compressedBytes: number;
  expandedBytes: number;
  localHeaderOffset: number;
  flags: number;
  method: number;
  directory: boolean;
}

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL = 0xffff;

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const first = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= first; offset -= 1) {
    if (readU32(bytes, offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }
  throw new ImportError("IMPORT_ARCHIVE_INVALID", "The archive has no end-of-directory record.");
}

export function assertSafeArchivePath(path: string) {
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    throw new ImportError("IMPORT_ARCHIVE_PATH_UNSAFE", `The archive path is unsafe: ${path || "(empty)"}.`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === ".." || !segment)) {
    throw new ImportError("IMPORT_ARCHIVE_PATH_UNSAFE", `The archive path escapes its root: ${path}.`);
  }
}

function listZipDirectory(bytes: Uint8Array, limits: ImportSafetyLimits): ZipDirectoryEntry[] {
  const end = findEndOfCentralDirectory(bytes);
  const diskNumber = readU16(bytes, end + 4);
  const directoryDisk = readU16(bytes, end + 6);
  const count = readU16(bytes, end + 10);
  const directorySize = readU32(bytes, end + 12);
  const directoryOffset = readU32(bytes, end + 16);

  if (diskNumber !== 0 || directoryDisk !== 0 || count === ZIP64_SENTINEL || directoryOffset === 0xffffffff) {
    throw new ImportError("IMPORT_ARCHIVE_INVALID", "Multi-disk and ZIP64 archives are not supported.");
  }
  if (count > limits.maximumEntries || directoryOffset + directorySize > bytes.length) {
    throw new ImportError("IMPORT_ARCHIVE_LIMIT_EXCEEDED", "The archive directory exceeds the import safety limits.");
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries: ZipDirectoryEntry[] = [];
  const paths = new Set<string>();
  let offset = directoryOffset;
  let expandedTotal = 0;

  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || readU32(bytes, offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new ImportError("IMPORT_ARCHIVE_INVALID", "The archive central directory is malformed.");
    }
    const flags = readU16(bytes, offset + 8);
    const method = readU16(bytes, offset + 10);
    const compressedBytes = readU32(bytes, offset + 20);
    const expandedBytes = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const localHeaderOffset = readU32(bytes, offset + 42);
    const endOfEntry = offset + 46 + nameLength + extraLength + commentLength;
    if (endOfEntry > bytes.length || (flags & 0x0001) !== 0) {
      throw new ImportError("IMPORT_ARCHIVE_INVALID", "The archive contains an unreadable or encrypted entry.");
    }

    let path: string;
    try {
      path = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    } catch {
      throw new ImportError("IMPORT_ARCHIVE_INVALID", "The archive contains a filename that is not valid UTF-8.");
    }
    const directory = path.endsWith("/");
    assertSafeArchivePath(directory ? path.slice(0, -1) : path);
    if (paths.has(path)) throw new ImportError("IMPORT_ARCHIVE_INVALID", `The archive has duplicate entry paths: ${path}.`);
    paths.add(path);
    if (directory && (compressedBytes !== 0 || expandedBytes !== 0)) {
      throw new ImportError("IMPORT_ARCHIVE_INVALID", `The archive directory has file data: ${path}.`);
    }
    if (expandedBytes > limits.maximumEntryBytes || expandedTotal + expandedBytes > limits.maximumExpandedBytes) {
      throw new ImportError("IMPORT_ARCHIVE_LIMIT_EXCEEDED", "The archive expands beyond the import safety limits.");
    }
    if (expandedBytes > 0 && (compressedBytes === 0 || expandedBytes / compressedBytes > limits.maximumCompressionRatio)) {
      throw new ImportError("IMPORT_ARCHIVE_COMPRESSION_RATIO", "The archive contains a suspiciously compressed entry.");
    }
    expandedTotal += expandedBytes;
    entries.push({ path, compressedBytes, expandedBytes, localHeaderOffset, flags, method, directory });
    offset = endOfEntry;
  }
  return entries;
}

function validateLocalHeaders(bytes: Uint8Array, entries: ZipDirectoryEntry[]) {
  for (const entry of entries) {
    const offset = entry.localHeaderOffset;
    if (offset + 30 > bytes.length || readU32(bytes, offset) !== LOCAL_FILE_SIGNATURE) {
      throw new ImportError("IMPORT_ARCHIVE_INVALID", `The archive local header is malformed: ${entry.path}.`);
    }
    const flags = readU16(bytes, offset + 6);
    const method = readU16(bytes, offset + 8);
    const compressedBytes = readU32(bytes, offset + 18);
    const expandedBytes = readU32(bytes, offset + 22);
    const nameLength = readU16(bytes, offset + 26);
    const extraLength = readU16(bytes, offset + 28);
    const dataStart = offset + 30 + nameLength + extraLength;
    let localPath: string;
    try {
      localPath = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    } catch {
      throw new ImportError("IMPORT_ARCHIVE_INVALID", `The archive local filename is invalid: ${entry.path}.`);
    }
    if ((flags & 0x0001) !== 0 || flags !== entry.flags || method !== entry.method || localPath !== entry.path || ![0, 8].includes(method) || dataStart + entry.compressedBytes > bytes.length) {
      throw new ImportError("IMPORT_ARCHIVE_INVALID", `The archive entry is unreadable: ${entry.path}.`);
    }
    if ((flags & 0x0008) === 0 && (compressedBytes !== entry.compressedBytes || expandedBytes !== entry.expandedBytes)) {
      throw new ImportError("IMPORT_ARCHIVE_INVALID", `The archive entry size does not match its directory: ${entry.path}.`);
    }
  }
}

export function readZipArchive(bytes: Uint8Array, overrides?: Partial<ImportSafetyLimits>): Map<string, Uint8Array> {
  const limits = importSafetyLimits({ limits: overrides });
  if (bytes.byteLength > limits.maximumArchiveBytes) {
    throw new ImportError("IMPORT_FILE_TOO_LARGE", "The archive exceeds the maximum import size.");
  }
  const directory = listZipDirectory(bytes, limits);
  validateLocalHeaders(bytes, directory);
  let contents: Record<string, Uint8Array>;
  try {
    contents = unzipSync(bytes);
  } catch {
    throw new ImportError("IMPORT_ARCHIVE_INVALID", "The archive could not be decompressed.");
  }

  const files = new Map<string, Uint8Array>();
  for (const entry of directory) {
    const content = contents[entry.path];
    if (entry.directory) {
      if (content && content.byteLength !== 0) throw new ImportError("IMPORT_ARCHIVE_INVALID", `The archive directory produced data: ${entry.path}.`);
      continue;
    }
    if (!content || content.byteLength !== entry.expandedBytes) {
      throw new ImportError("IMPORT_ARCHIVE_INVALID", `The archive entry is incomplete: ${entry.path}.`);
    }
    files.set(entry.path, content);
  }
  return files;
}

export function requireArchiveText(files: Map<string, Uint8Array>, path: string): string {
  const bytes = files.get(path);
  if (!bytes) throw new ImportError("IMPORT_FORMAT_INVALID", `The archive is missing ${path}.`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ImportError("IMPORT_FORMAT_INVALID", `${path} is not valid UTF-8 text.`);
  }
}

const mediaTypesByExtension: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
  bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif", avif: "image/avif", ico: "image/x-icon",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac",
  pdf: "application/pdf", zip: "application/zip", json: "application/json", txt: "text/plain", md: "text/markdown", csv: "text/csv",
  key: "application/vnd.apple.keynote", pages: "application/vnd.apple.pages", numbers: "application/vnd.apple.numbers",
  doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

/**
 * An archive file's type comes from its extension, and from its leading bytes
 * when the extension says nothing. A file present in the archive is always
 * imported; an unknown extension is never a reason to drop it.
 */
export function archiveMediaType(path: string, bytes?: Uint8Array): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const declared = mediaTypesByExtension[extension];
  if (declared) return declared;
  if (!bytes || bytes.byteLength < 12) return "application/octet-stream";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return "video/mp4";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "application/zip";
  return "application/octet-stream";
}
