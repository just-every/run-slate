export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface EntityRef { id: string; kind: string; revisionId: string }
export interface MutationInput { operationKey: string; expectedRevisionId?: string }
export interface MutationReceipt { operationKey: string; entity: EntityRef; revisionId: string; activityId: string | null; committedAt: string; unchanged?: true }
export interface PageResult<T> { items: T[]; nextCursor?: string; total?: number }
export interface ApiError { code: string; message: string; details?: JsonValue }
