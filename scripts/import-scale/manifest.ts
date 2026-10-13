import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { REQUIRED_PROVENANCE } from "./expected";
import type { ArchiveBlueprint, WrittenZip } from "./types";

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

function within(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(".." + sep) && path !== ".." && !isAbsolute(path));
}

export async function guardedDirectory(root: string, allowedRelative: string, targetRelative: string): Promise<string> {
  const rootReal = await realpath(root);
  const allowedPath = resolve(rootReal, allowedRelative);
  const targetPath = resolve(rootReal, targetRelative);
  if (!within(allowedPath, targetPath)) throw new Error("Generated output path is outside " + allowedRelative + ".");

  const ensureDirectoryChain = async (parent: string, child: string) => {
    const relativePath = relative(parent, child);
    let current = parent;
    for (const segment of relativePath ? relativePath.split(sep) : []) {
      current = resolve(current, segment);
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Generated output path contains a symlink or non-directory: " + current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await mkdir(current, { mode: 0o700 });
      }
    }
  };

  await ensureDirectoryChain(rootReal, allowedPath);
  await ensureDirectoryChain(allowedPath, targetPath);
  const [allowedReal, targetReal] = await Promise.all([realpath(allowedPath), realpath(targetPath)]);
  if (allowedReal !== allowedPath || targetReal !== targetPath || !within(allowedReal, targetReal)) {
    throw new Error("Generated output path resolves through an unexpected symlink or outside " + allowedRelative + ".");
  }
  return targetReal;
}

export function guardedFilePath(root: string, allowedRelative: string, targetPath: string): string {
  const allowedPath = resolve(root, allowedRelative);
  const resolvedTarget = resolve(root, targetPath);
  if (!within(allowedPath, resolvedTarget)) throw new Error("Generated file path is outside " + allowedRelative + ".");
  return resolvedTarget;
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const temporary = path + ".partial-" + process.pid;
  await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(content, "utf8");
    await file.sync();
  } catch (error) {
    await file.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  await file.close();
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function jsonManifest(blueprint: ArchiveBlueprint, archivePath: string, archive: WrittenZip, manifestPath: string) {
  const files = archive.entries.filter((entry) => !entry.path.endsWith("/")).length;
  const directories = archive.entries.length - files;
  if (archive.archiveBytes > MAX_ARCHIVE_BYTES) throw new Error("Generated ZIP exceeds the import source archive byte limit.");
  if (archive.maximumCompressionRatio > MAX_COMPRESSION_RATIO) throw new Error("Generated ZIP exceeds the import per-entry compression ratio.");
  return {
    schemaVersion: 1,
    provenance: REQUIRED_PROVENANCE,
    group: blueprint.group,
    archiveFormat: blueprint.format,
    archiveExpectation: blueprint.archiveExpectation,
    expectedState: blueprint.archiveExpectation.outcome === "success" ? "provisional-awaiting-import-receipt" : "expected-reject-before-native-publication",
    archive: {
      path: archivePath,
      bytes: archive.archiveBytes,
      compressedBytes: archive.compressedBytes,
      expandedBytes: archive.expandedBytes,
      maxFileBytes: archive.maxFileBytes,
      maximumFileBytes: archive.maxFileBytes,
      maximumCompressionRatio: archive.maximumCompressionRatio,
      entryCount: archive.entries.length,
      files,
      physicalFiles: files,
      directories,
      entries: archive.entries,
    },
    sourceExpected: blueprint.sourceExpected,
    nativeExpected: blueprint.nativeExpected,
    reportProjection: blueprint.reportProjection,
    reportProjectionMeaning: "Contextual count projection only; it is not the pass/fail target. Reconcile durable native rows and revisions against the independent physical nativeExpected formula.",
    expectedWarnings: blueprint.expectedWarnings ?? {},
    knownSourceLosses: blueprint.knownSourceLosses ?? [],
    derivation: blueprint.derivation,
    sourceInventory: blueprint.sourceInventory ?? {},
    restrictionSpec: blueprint.restrictionSpec ?? null,
    nativeFormatSpec: blueprint.nativeFormatSpec ?? null,
    traceMarkers: blueprint.traceMarkers ?? [],
    idMappings: blueprint.idMappings ?? [],
    parserObservation: blueprint.parserObservation ?? "run",
    manifestPath,
    reportPath: manifestPath.replace(/\.json$/i, ".txt"),
  };
}

function reportText(manifest: ReturnType<typeof jsonManifest>): string {
  const archive = manifest.archive;
  const native = manifest.nativeExpected;
  return [
    REQUIRED_PROVENANCE,
    "",
    "Group: " + manifest.group,
    "Archive: " + archive.path,
    "Expected archive outcome: " + manifest.archiveExpectation.outcome + (manifest.archiveExpectation.message ? " — " + manifest.archiveExpectation.message : ""),
    "ZIP inventory: " + archive.entryCount + " entries, " + archive.files + " files, " + archive.directories + " directory entries",
    "Expanded bytes: " + archive.expandedBytes + "; compressed data bytes: " + archive.compressedBytes + "; archive bytes: " + archive.bytes,
    "Maximum entry bytes: " + archive.maximumFileBytes + "; maximum expansion ratio: " + archive.maximumCompressionRatio,
    "Source-normalized expected counts: " + JSON.stringify(manifest.sourceExpected),
    "Physical native expected counts: " + JSON.stringify(native),
    "Contextual import-report/count projection (not a pass/fail target): " + JSON.stringify(manifest.reportProjection),
    "Source inventory and derived object census: " + JSON.stringify(manifest.sourceInventory),
    "Expected warnings: " + JSON.stringify(manifest.expectedWarnings),
    "Unsupported or source-property losses: " + JSON.stringify(manifest.knownSourceLosses),
    "Restriction mapping specification: " + JSON.stringify(manifest.restrictionSpec),
    "Generated format and entity-graph specification: " + JSON.stringify(manifest.nativeFormatSpec),
    "Observed importer result: pending actual import receipt; parser observations never define the expected counts.",
    "The ZIP is generated output under the ignored evidence/generated/imports directory and is not a committed source fixture.",
    "",
  ].join("\n");
}

export async function writeManifestAndReport(
  blueprint: ArchiveBlueprint,
  archiveRelativePath: string,
  archive: WrittenZip,
  manifestRoot: string,
  requestedManifestPath: string,
): Promise<{ manifestPath: string; reportPath: string; content: ReturnType<typeof jsonManifest> }> {
  const manifestJsonPath = guardedFilePath(manifestRoot, "evidence/imports", requestedManifestPath);
  if (!manifestJsonPath.endsWith(".json")) throw new Error("Manifest path must end in .json.");
  const reportPath = manifestJsonPath.slice(0, -5) + ".txt";
  const manifestDirectoryRelative = relative(manifestRoot, dirname(manifestJsonPath));
  await guardedDirectory(manifestRoot, "evidence/imports", manifestDirectoryRelative);
  const [allowedManifest, manifestDirectory, allowedReport, reportDirectory] = await Promise.all([
    realpath(resolve(manifestRoot, "evidence/imports")),
    realpath(dirname(manifestJsonPath)),
    realpath(resolve(manifestRoot, "evidence/imports")),
    realpath(dirname(reportPath)),
  ]);
  if (!within(allowedManifest, manifestDirectory) || !within(allowedReport, reportDirectory)) throw new Error("Manifest or report path resolves outside evidence/imports.");
  const content = jsonManifest(blueprint, archiveRelativePath, archive, relative(manifestRoot, manifestJsonPath));
  await writeAtomic(manifestJsonPath, JSON.stringify(content, null, 2) + "\n");
  await writeAtomic(reportPath, reportText(content));
  return { manifestPath: relative(manifestRoot, manifestJsonPath), reportPath: relative(manifestRoot, reportPath), content };
}
