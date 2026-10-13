export type ExpectedImportCounts = {
  containers: number;
  pages: number;
  databases: number;
  records: number;
  media: number;
  versions: number;
  restrictions: number;
  labels: number;
  unsupportedConstructs: Record<string, number>;
};

export type PhysicalExpectedCounts = ExpectedImportCounts & {
  files: number;
  pageRows: number;
  databaseBackingPages: number;
  detachedRecordPages: number;
  initialPageRevisions: number;
  importedSourceRevisions: number;
  mappedRestrictionGrants: number;
  unresolvedRestrictions: number;
};

export type ArchiveEntrySource = Uint8Array | string | AsyncIterable<Uint8Array> | Iterable<Uint8Array>;

export interface GeneratedZipEntry {
  path: string;
  source: ArchiveEntrySource;
}

export interface WrittenZipEntry {
  path: string;
  expandedBytes: number;
  compressedBytes: number;
}

export interface WrittenZip {
  archiveBytes: number;
  compressedBytes: number;
  expandedBytes: number;
  maxFileBytes: number;
  maximumCompressionRatio: number;
  entries: WrittenZipEntry[];
}

export interface ArchiveExpectation {
  outcome: "success" | "reject";
  reason?: string;
  message?: string;
}

export interface ArchiveBlueprint {
  group: string;
  archiveName: string;
  format: "notion-workspace" | "confluence-space";
  entries: GeneratedZipEntry[];
  derivation: string[];
  sourceExpected: ExpectedImportCounts;
  nativeExpected: PhysicalExpectedCounts;
  reportProjection: ExpectedImportCounts;
  expectedWarnings?: Record<string, number>;
  knownSourceLosses?: string[];
  sourceInventory?: Record<string, unknown>;
  archiveExpectation: ArchiveExpectation;
  restrictionSpec?: Record<string, unknown>;
  nativeFormatSpec?: Record<string, unknown>;
  traceMarkers?: Array<{ marker: string; sourcePath: string; generatedPath: string; sourceId: string }>;
  idMappings?: Array<{ sourceId: string; generatedId: string; generatedPath: string }>;
  parserObservation: "run" | "skip-boundary";
}
