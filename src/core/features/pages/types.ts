import type { PageCover } from './appearance';
import type { BlockView } from '../../shared/api/content';
import type { JsonValue } from '../../shared/api/common';
import type { PageLifecycle } from '../../shared/knowledge/model';
export interface PageRow {
    agent_creator_json?:string|null;
    id: string;
    workspace_id: string;
    container_id: string;
    parent_page_id: string | null;
    database_id: string | null;
    page_kind: string;
    title: string;
    icon: string | null;
    cover_file_id: string | null;
    author_member_id: string;
    owner_member_id: string | null;
    lifecycle: PageLifecycle;
    working_revision_id: string;
    published_revision_id: string | null;
    status_key: string | null;
    tree_position: string;
    access_inheritance: string;
    typeface: string;
    small_text: number;
    full_width: number;
    locked_at: string | null;
    locked_by_member_id: string | null;
    archived_at: string | null;
    trashed_at: string | null;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
    revision_id: string;
}
export interface PageProperties {
    byline?: string;
    databaseFields?: Record<string, JsonValue>;
    title: string;
    icon: string | null;
    coverFileId: string | null;
    cover?: PageCover | null;
    ownerMemberId: string | null;
    statusKey: string | null;
    labels: string[];
    typeface: string;
    smallText: boolean;
    fullWidth: boolean;
}
export interface RevisionSnapshot {
    blocks: BlockView[];
    properties: PageProperties;
}
export interface PageCreateInput {
    operationKey: string;
    id?: string;
    containerId: string;
    parentPageId?: string | null;
    title: string;
    pageKind?: 'page' | 'record' | 'database';
    databaseId?: string | null;
    lifecycle?: PageLifecycle;
    blocks?: BlockInput[];
    properties?: Partial<PageProperties>;
    treePosition?: string;
}
export interface BlockInput {
    id: string;
    blockType: string;
    content: JsonValue;
    parentBlockId?: string | null;
    treePosition: string;
}
export interface PageUpdateInput {
    operationKey: string;
    expectedRevisionId: string;
    properties: Partial<PageProperties>;
}
export interface BlockUpdateInput {
    operationKey: string;
    expectedRevisionId: string;
    content: JsonValue;
}
export interface RevisionRow {
    id: string;
    page_id: string;
    author_member_id: string | null;
    origin: string;
    content_hash: string;
    body_json: string;
    properties_json: string;
    status_key: string | null;
    ordinal: number | null;
    label: string | null;
    created_at: string;
    deleted_at: string | null;
    deleted_by_member_id: string | null;
}
