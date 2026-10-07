export type ImportErrorCode =
  | "IMPORT_FILE_TOO_LARGE"
  | "IMPORT_ARCHIVE_INVALID"
  | "IMPORT_ARCHIVE_PATH_UNSAFE"
  | "IMPORT_ARCHIVE_LIMIT_EXCEEDED"
  | "IMPORT_ARCHIVE_COMPRESSION_RATIO"
  | "IMPORT_FORMAT_INVALID"
  | "IMPORT_FORMAT_UNSUPPORTED";

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode, message: string) {
    super(message);
    this.name = "ImportError";
  }
}
