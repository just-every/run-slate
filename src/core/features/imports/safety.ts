import { ImportError } from "./errors";
import { defaultImportSafetyLimits, type ImportParseOptions, type ImportSafetyLimits, type ImportSourceFile } from "./types";

export function importSafetyLimits(options?: ImportParseOptions): ImportSafetyLimits {
  return { ...defaultImportSafetyLimits, ...options?.limits };
}

export function assertImportSourceSize(source: ImportSourceFile, options?: ImportParseOptions) {
  if (source.bytes.byteLength > importSafetyLimits(options).maximumArchiveBytes) {
    throw new ImportError("IMPORT_FILE_TOO_LARGE", `The source file exceeds the ${importSafetyLimits(options).maximumArchiveBytes} byte import limit.`);
  }
}
