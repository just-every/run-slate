import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import { parseCsvTable, type CsvTable } from "./csv";

export const REAL_FIXTURE_DIRECTORY = "tests/e2e/imports/fixtures/real";
export const NOTION_SOURCE_PATH = `${REAL_FIXTURE_DIRECTORY}/notion-workspace-export.zip`;
export const CLOUD_SOURCE_PATH = `${REAL_FIXTURE_DIRECTORY}/confluence-space-export.zip`;

export function repositoryRoot(scriptDirectory: string): string {
  return resolve(scriptDirectory, "../..");
}

export function readSourceArchive(root: string, relativePath: string): { bytes: Uint8Array; files: Map<string, Uint8Array> } {
  const bytes = new Uint8Array(readFileSync(resolve(root, relativePath)));
  const unpacked = unzipSync(bytes);
  return { bytes, files: new Map(Object.entries(unpacked)) };
}

export function decodeSourceText(bytes: Uint8Array, sourcePath: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${sourcePath} in the committed anonymized fixture is not UTF-8.`);
  }
}

export function sourceCsvTables(files: Map<string, Uint8Array>): Map<string, CsvTable> {
  const tables = new Map<string, CsvTable>();
  for (const [path, bytes] of files) {
    if (path.includes("/") || !/\.csv(?:\.gz)?$/i.test(path)) continue;
    const name = (path.split("/").at(-1) ?? path).replace(/\.csv(?:\.gz)?$/i, "");
    tables.set(name, parseCsvTable(path, bytes));
  }
  return tables;
}

export function utf8(value: string): Uint8Array {
  return Buffer.from(value, "utf8");
}
