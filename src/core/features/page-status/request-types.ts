export type ReviewAssigneeKind = 'member' | 'group';
export type ReviewRequestState = 'pending' | 'verified' | 'changes_requested' | 'cancelled';
export interface ReviewAssignment { assigneeKind: ReviewAssigneeKind; assigneeId: string }
export interface ReviewDue { date: string; time: string; timezone: string; note: string }
export interface ReviewRequestInput extends ReviewAssignment, ReviewDue { operationKey: string; expectedRevisionId: string }
export interface ReviewRequestCAS { operationKey: string; assignmentGeneration: number; expectedRevisionId: string }
export interface ReviewRequestRow {
 id: string; workspace_id: string; page_id: string; requester_member_id: string;
 assignee_kind: ReviewAssigneeKind; assignee_id: string; assignment_generation: number;
 requested_revision_id: string; due_date: string; due_time: string; timezone: string; due_at: string; note: string;
 state: ReviewRequestState; revision_id: string; comment_id: string | null;
 resolved_by_member_id: string | null; resolved_at: string | null; dispatch_paused_at: string | null; created_at: string; updated_at: string;
}
export interface ReviewRequestItem {
 id: string; pageId: string; title: string; containerName: string | null;
 requesterId: string; requesterName: string; assigneeKind: ReviewAssigneeKind; assigneeId: string; assigneeName: string;
 assignmentGeneration: number; revisionId: string; requestedRevisionId: string;
 date: string; time: string; timezone: string; dueAt: string; note: string; state: ReviewRequestState;
 pageRevisionId: string; workingRevisionId: string; statusKey: string | null; openedCurrent: boolean;
 canVerify: boolean; canRequestChanges: boolean; canReassign: boolean; canCancel: boolean;
 reviewerRemindedAt: string | null; ownerReminderAt: string; ownerRemindedAt: string | null;
 dispatchPausedAt: string | null; commentId: string | null; resolvedAt: string | null;
}
export interface ReviewRequestQueue { items: ReviewRequestItem[]; total: number; nextCursor?: string; counts: { assigned: number; requested: number }; canBulkVerify: boolean }
export interface ReviewTarget { expertise?:string[]; kind: ReviewAssigneeKind; id: string; name: string }
