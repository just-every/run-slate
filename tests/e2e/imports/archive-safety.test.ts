import { expect, test } from "vitest";
import { strToU8, zipSync } from "fflate";
import { ImportError, parseImport } from "../../../src/core/features/imports/index";
import { readZipArchive } from "../../../src/core/features/imports/archive";
import { htmlBlocks } from "../../../src/core/features/imports/html";
import { createImportReport } from "../../../src/core/features/imports/report";
import { parseXml } from "../../../src/core/features/imports/xml";

test("archive import rejects traversal paths before parsing documents", () => {
  const archive = zipSync({ "../escape.md": strToU8("# escape") });
  expect(() => parseImport("notion-workspace", { name: "unsafe.zip", bytes: archive })).toThrowError({ asymmetricMatch: (error: unknown) => error instanceof ImportError && error.code === "IMPORT_ARCHIVE_PATH_UNSAFE" });
});

test("archive import applies declared compression and entry limits before decompression", () => {
  const archive = zipSync({ "page.md": strToU8("A".repeat(16_384)) });
  expect(() => parseImport("notion-workspace", { name: "bounded.zip", bytes: archive }, { limits: { maximumEntryBytes: 8_192, maximumExpandedBytes: 8_192, maximumCompressionRatio: 2 } })).toThrowError({ asymmetricMatch: (error: unknown) => error instanceof ImportError && ["IMPORT_ARCHIVE_LIMIT_EXCEEDED", "IMPORT_ARCHIVE_COMPRESSION_RATIO"].includes(error.code) });
});

test("archive import validates directory payloads and local names before fflate decompresses entries", () => {
  const directoryPayload = zipSync({ "payload/": strToU8("not a directory") });
  expect(() => readZipArchive(directoryPayload, { maximumEntryBytes: 4, maximumExpandedBytes: 4 })).toThrowError({ asymmetricMatch: (error: unknown) => error instanceof ImportError && error.code === "IMPORT_ARCHIVE_INVALID" });

  const archive = zipSync({ "page.md": strToU8("body") });
  archive.set(strToU8("evil.md"), 30);
  expect(() => readZipArchive(archive)).toThrowError({ asymmetricMatch: (error: unknown) => error instanceof ImportError && error.code === "IMPORT_ARCHIVE_INVALID" });
});

test("markup strips browser-normalized unsafe schemes and XML rejects malformed or declared entities", () => {
  const report = createImportReport();
  const blocks = htmlBlocks('<p><a href="java&#10;script:alert(1)">link</a></p>', "source", report);
  expect(blocks[0]?.links.length).toBe(0);
  expect(parseImport("markdown", { name: "unsafe.md", bytes: strToU8("[link](java\tscript:alert(1))") }).pages[0]?.blocks[0]?.links.length).toBe(0);
  expect(() => parseXml("<root><unclosed></root>", "test")).toThrowError({ asymmetricMatch: (error: unknown) => error instanceof ImportError && error.code === "IMPORT_FORMAT_INVALID" });
  expect(() => parseXml("<!DOCTYPE root [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><root>&xxe;</root>", "test")).toThrowError({ asymmetricMatch: (error: unknown) => error instanceof ImportError && error.code === "IMPORT_FORMAT_INVALID" });
});

test("PDF enforces a cumulative expanded-stream budget", () => {
  const pdf = strToU8("%PDF-1.4\n1 0 obj\n<< /Length 18 >>\nstream\nBT (first text) Tj ET\nendstream\nendobj\n2 0 obj\n<< /Length 19 >>\nstream\nBT (second text) Tj ET\nendstream\nendobj\n%%EOF");
  expect(() => parseImport("pdf", { name: "bounded.pdf", bytes: pdf }, { limits: { maximumEntryBytes: 64, maximumExpandedBytes: 30 } })).toThrowError({ asymmetricMatch: (error: unknown) => error instanceof ImportError && error.code === "IMPORT_ARCHIVE_LIMIT_EXCEEDED" });
});
