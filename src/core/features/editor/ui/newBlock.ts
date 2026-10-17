import type { InsertKind } from "./blockCatalog";
import type { EditorBlock } from "./types";

/** Empty authoring inputs, never sample product records. IDs become durable on save. */
export function newBlock(
  kind: InsertKind,
  id: string = crypto.randomUUID(),
): EditorBlock {
  const text = [{ text: "" }];
  switch (kind) {
    case "status":
      throw new Error("Status labels are inserted inline.");
    case "table-of-contents":
      return {id,type:"table-of-contents",minLevel:1,maxLevel:2,style:"nested"};
    case "task-report":
      return {id,type:"task-report",definition:{groupBy:"page",orderBy:"due",direction:"asc",limit:20}};
    case "text":
      return { id, type: "paragraph", text };
    case "heading-1":
    case "heading-2":
    case "heading-3":
      return {
        id,
        type: "heading",
        level: Number(kind.at(-1)) as 1 | 2 | 3,
        text,
      };
    case "bulleted-list":
    case "numbered-list":
    case "toggle-list":
      return {
        id,
        type: "list",
        variant:
          kind === "bulleted-list"
            ? "bulleted"
            : kind === "numbered-list"
              ? "numbered"
              : "toggle",
        items: [{ id: crypto.randomUUID(), text }],
      };
    case "task":
      return { id, type: "task", text, done: false };
    case "quote":
      return { id, type: "quote", text };
    case "divider":
      return { id, type: "divider" };
    case "callout":
      return { id, type: "callout", tone: "neutral", text };
    case "expandable":
      return { id, type: "expandable", summary: "", open: true, content: text };
    case "table":
      return {
        id,
        type: "table",
        columns: ["", ""],
        rows: [{ id: crypto.randomUUID(), cells: ["", ""] }],
      };
    case "code":
      return {
        id,
        type: "code",
        language: "text",
        languages: [
          "text",
          "javascript",
          "typescript",
          "python",
          "sql",
          "html",
          "css",
          "json",
          "bash",
        ],
        code: "",
      };
    case "image":
    case "video":
    case "audio":
    case "file":
      return { id, type: "media", kind, source: null, caption: "", alt: "" };
    case "link-card":
      return {
        id,
        type: "link-card",
        url: "",
        display: "plain",
        previewState: "ready",
      };
    case "content-query":
      return {
        id,
        type: "content-query",
        definition: {},
        lastRanLabel: "Not run yet",
        results: [],
      };
  }
}
