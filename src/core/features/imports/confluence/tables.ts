import {archiveMediaSource} from '../archive-stream';
import { parseCsvRows } from "../csv";
import { ImportError } from "../errors";
import {compactNativeValues,transferNativeValue} from '../compact-native-values';
import { createExpansionBudget, gunzipBounded, isGzip, reserveExpansion, type ExpansionBudget } from "../inflate";
import type { ImportSafetyLimits } from "../types";

/**
 * A Confluence Cloud space export is a set of per-table CSV files at the archive
 * root. They carry a `.csv.gz` extension but Cloud writes them uncompressed, so
 * the gzip magic decides how each one is read rather than its name. A member
 * that really is gzipped is inflated against a budget shared across the whole
 * export: the zip's own limits saw only the compressed member.
 */

export interface ConfluenceTable {
  name: string;
  header: string[];
  rows: Record<string, string>[];
}

export type ConfluenceTables = Map<string, ConfluenceTable>;

export interface ConfluenceExport {
  tables: ConfluenceTables;
  descriptor: Record<string, string>;
}

function* decodeWindows(name: string, bytes: Uint8Array, budget: ExpansionBudget):Generator<string> {
  let payload = bytes;
  if (isGzip(bytes)) {
    payload = gunzipBounded(bytes, budget);
  } else {
    reserveExpansion(budget, bytes.byteLength);
    budget.expandedBytes += bytes.byteLength;
  }
  try {
    const decoder=new TextDecoder("utf-8", { fatal: true });
    for(let offset=0;offset<payload.length;offset+=64*1024)yield decoder.decode(payload.subarray(offset,offset+64*1024),{stream:true});
    const last=decoder.decode();if(last)yield last;
  } catch {
    throw new ImportError("IMPORT_FORMAT_INVALID", `${name} is not valid UTF-8 text.`);
  }
}

function tableName(path: string): string {
  return (path.split("/").at(-1) ?? path).replace(/\.csv(?:\.gz)?$/i, "");
}

function readTables(files: Map<string, Uint8Array>, budget: ExpansionBudget): ConfluenceTables {
  const tables: ConfluenceTables = new Map();
  for (const path of files.keys()) {
    // Only the archive root holds database tables. `whiteboards/data/*.csv`
    // carries opaque canvas payloads and is named in the report instead.
    if (path.includes("/") || !/\.csv(?:\.gz)?$/i.test(path)) continue;
    const name = tableName(path);
    const rows = parseCsvRows(decodeWindows(path, files.get(path)!, budget));
    const header = rows.next().value;
    if (!header?.length) continue;
    const table:ConfluenceTable={name,header,rows:[]};
    tables.set(name,table);
    for(const row of rows){
        if (row.length !== header.length) {
          throw new ImportError("IMPORT_FORMAT_INVALID", `${path} has a row with ${row.length} fields where its header declares ${header.length}.`);
        }
        const retained=compactNativeValues(row,true),record:Record<string,string>={};
        header.forEach((column:string,index:number)=>transferNativeValue(retained,index,record,column));
        table.rows.push(record);
    }
  }
  return tables;
}

/** `exportDescriptor.properties` is a Java properties file, gzipped or not. */
function readDescriptor(files: Map<string, Uint8Array>, budget: ExpansionBudget): Record<string, string> {
  const path = [...files.keys()].find((candidate) => /(?:^|\/)exportDescriptor\.properties(?:\.gz)?$/i.test(candidate));
  if (!path) return {};
  return Object.fromEntries([...decodeWindows(path, files.get(path)!, budget)].join('').split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const split = line.indexOf("=");
      return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    }));
}

export function readConfluenceExport(files: Map<string, Uint8Array>, limits: ImportSafetyLimits): ConfluenceExport {
  const budget = createExpansionBudget(limits, "A Confluence export member");
  const descriptor=[...files.keys()].find(path=>/(?:^|\/)exportDescriptor\.properties(?:\.gz)?$/i.test(path));
  // Nested gzip replaces its ZIP member's contribution; attachments and every
  // other entry still count toward the same whole-export expansion ceiling.
  for(const path of files.keys()){
    if(path===descriptor||!path.includes('/')&&/\.csv(?:\.gz)?$/i.test(path))continue;
    const size=archiveMediaSource(files,path)?.sizeBytes??files.get(path)!.length;
    reserveExpansion(budget,size);budget.expandedBytes+=size;
  }
  return { tables: readTables(files, budget), descriptor: readDescriptor(files, budget) };
}

export function requireTable(tables: ConfluenceTables, name: string): ConfluenceTable {
  const table = tables.get(name);
  if (!table) throw new ImportError("IMPORT_FORMAT_INVALID", `The Confluence space export is missing ${name}.csv.`);
  return table;
}

export function tableRows(tables: ConfluenceTables, name: string): Record<string, string>[] {
  return tables.get(name)?.rows ?? [];
}
