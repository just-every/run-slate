import type { ImportReport, ImportReportEntry, ImportReportEntryKind } from "./types";

export function createImportReport(): ImportReport {
  return { created: [], unmapped: [], warnings: [] };
}

export function reportCreated(report: ImportReport, kind: ImportReportEntryKind, label: string, sourceId?: string, detail?: string) {
  report.created.push({ kind, label, sourceId, detail });
}

export function reportUnmapped(report: ImportReport, label: string, sourceId?: string, detail?: string) {
  report.unmapped.push({ kind: "construct", label, sourceId, detail });
}

export function reportWarning(report: ImportReport, label: string, sourceId?: string, detail?: string) {
  report.warnings.push({ kind: "construct", label, sourceId, detail });
}

export function reportMissingArchiveFile(report: ImportReport, archivePath: string, sourceId?: string) {
  reportUnmapped(report, "Archive file was not present", sourceId, archivePath);
}

export function cloneReportEntry(entry: ImportReportEntry): ImportReportEntry {
  return { ...entry };
}
