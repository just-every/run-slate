import {
  AudioLines,
  ChevronsDownUp,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Info,
  Link,
  List,
  ListOrdered,
  ListTodo,
  ListTree,
  Minus,
  Paperclip,
  Quote,
  Table,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * Every block the contract names, in the order the insert menu offers it
 * (`BLOCK-003`), each with the Markdown shortcut that writes it (`BLOCK-004`).
 */
export type InsertKind =
  | "text"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bulleted-list"
  | "numbered-list"
  | "toggle-list"
  | "task"
  | "quote"
  | "divider"
  | "callout"
  | "expandable"
  | "table"
  | "code"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "file-card"
  | "link-card"
  | "content-query"
  | "table-of-contents"
  | "dashboard"
  | "task-report"
  | "status";

export interface InsertEntry {
  kind: InsertKind;
  name: string;
  /** The Markdown that writes the same block as it is typed. */
  shortcut?: string;
  icon: LucideIcon;
  /** Read out beside the name in the touch sheet. */
  description: string;
}

export interface InsertGroup {
  id: string;
  heading: string;
  entries: InsertEntry[];
}

const basic: InsertEntry[] = [
  { kind: "text", name: "Text", icon: Type, description: "Plain paragraph text" },
  { kind: "heading-1", name: "Heading 1", shortcut: "#", icon: Heading1, description: "Top section heading" },
  { kind: "heading-2", name: "Heading 2", shortcut: "##", icon: Heading2, description: "Section heading" },
  { kind: "heading-3", name: "Heading 3", shortcut: "###", icon: Heading3, description: "Sub-section heading" },
  { kind: "bulleted-list", name: "Bulleted list", shortcut: "-", icon: List, description: "An unordered list" },
  { kind: "numbered-list", name: "Numbered list", shortcut: "1.", icon: ListOrdered, description: "An ordered list" },
  { kind: "toggle-list", name: "Toggle list", icon: ChevronsDownUp, description: "A list that folds away" },
  { kind: "task", name: "To-do", shortcut: "[]", icon: ListTodo, description: "A checkable item" },
  { kind: "quote", name: "Quote", shortcut: ">", icon: Quote, description: "A quoted passage" },
  { kind: "divider", name: "Divider", shortcut: "---", icon: Minus, description: "A horizontal rule" },
  { kind: "callout", name: "Callout", icon: Info, description: "A panel that stands out" },
  { kind: "expandable", name: "Expandable section", icon: ChevronsDownUp, description: "A summary that opens" },
  { kind: "table", name: "Table", icon: Table, description: "Rows and columns with a header" },
  { kind: "code", name: "Code", shortcut: "```", icon: Code, description: "Code with a language and copy" },
];

const media: InsertEntry[] = [
  {kind:"file-card",name:"Connected file",icon:Paperclip,description:"Reference a file in Drive or SharePoint"},
  { kind: "image", name: "Image", icon: Image, description: "Upload or link an image" },
  { kind: "video", name: "Video", icon: Video, description: "Upload or link a video" },
  { kind: "audio", name: "Audio", icon: AudioLines, description: "Upload or link audio" },
  { kind: "file", name: "File attachment", icon: Paperclip, description: "A file to download" },
  { kind: "link-card", name: "Link card", icon: Link, description: "A link with its preview" },
];

const advanced: InsertEntry[] = [
  {kind:"dashboard",name:"Dashboard",icon:Table,description:"Charts and views with shared date and person filters"},
  {kind:"table-of-contents",name:"Table of contents",icon:ListTree,description:"Links to headings in this page"},
  {kind:"task-report",name:"Task report",icon:ListTodo,description:"Live tasks the current reader can access"},
  {kind:"status",name:"Status label",shortcut:"/status",icon:Info,description:"An inline label with text and colour"},
  { kind: "content-query", name: "Content query", icon: ListTree, description: "A live list of pages" },
];

export const insertGroups: InsertGroup[] = [
  { id: "basic", heading: "Basic blocks", entries: basic },
  { id: "media", heading: "Media", entries: media },
  { id: "advanced", heading: "Advanced", entries: advanced },
];

export const insertEntries: InsertEntry[] = insertGroups.flatMap((group) => group.entries);

export function findInsertEntries(kinds: InsertKind[]): InsertEntry[] {
  return kinds
    .map((kind) => insertEntries.find((entry) => entry.kind === kind))
    .filter((entry): entry is InsertEntry => Boolean(entry));
}

export function filterInsertGroups(query: string): InsertGroup[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return insertGroups;
  return insertGroups
    .map((group) => ({
      ...group,
      entries: group.entries.filter(
        (entry) =>
          entry.name.toLowerCase().includes(needle) ||
          entry.description.toLowerCase().includes(needle) ||
          (entry.shortcut ?? "").toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.entries.length > 0);
}
