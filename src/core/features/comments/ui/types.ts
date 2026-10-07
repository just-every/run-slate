import type { AccessLevel } from "../../../shared/knowledge/model";

/** COMM-001 — a thread is Open or Resolved. */
export type CommentThreadStatus = "open" | "resolved";

/** COMM-001 — both kinds are threads; only their anchor differs. */
export type CommentAnchorKind = "inline" | "page";

/**
 * COMM-004 — an inline anchor follows its text through edits. When the text is
 * deleted the anchor becomes orphaned and names the revision it was anchored in.
 */
export interface AnchorRevision {
  id: string;
  label: string;
  committedAtLabel: string;
}

export interface InlineCommentAnchor {
  kind: "inline";
  blockId: string;
  /** The quoted run of text the thread is anchored to. */
  quotedText: string;
  /** Null while the anchor still resolves; set once its text was deleted. */
  orphanedIn: AnchorRevision | null;
}

export interface PageCommentAnchor {
  kind: "page";
  pageTitle: string;
}

export type CommentAnchor = InlineCommentAnchor | PageCommentAnchor;

export interface CommentPerson {
  id: string;
  name: string;
  initials: string;
}

/** COMM-005 — reactions show who reacted and never notify. */
export interface CommentReaction {
  emoji: string;
  reactors: readonly CommentPerson[];
  reactedByViewer: boolean;
}

export interface CommentAttachment {
  id: string;
  name: string;
  sizeLabel: string;
}

/** COMM-002 — a deleted comment leaves a tombstone in place. */
export interface CommentRecord {
  id: string;
  author: CommentPerson;
  createdAtLabel: string;
  /** COMM-002 — set when the comment was edited, showing when it last was. */
  editedAtLabel: string | null;
  body: string;
  deletedAtLabel: string | null;
  /** COMM-002 — edit and delete are offered for the viewer's own comments only. */
  isOwn: boolean;
  reactions: readonly CommentReaction[];
  attachments: readonly CommentAttachment[];
}

export interface CommentThreadRecord {
  id: string;
  anchor: CommentAnchor;
  status: CommentThreadStatus;
  comments: readonly CommentRecord[];
}

/** SHARE-002 — `comment` and above may open and reply to threads. */
export function canComment(level: AccessLevel): boolean {
  return level === "comment" || level === "edit" || level === "full";
}
