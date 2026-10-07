import type { AccessLevel, PageLifecycle } from '../knowledge/model';
import type { KnowledgePolicyProfile } from '../knowledge/policies';
import type { JsonValue } from './common';
export interface PageRef { id: string; containerId: string; title: string; revisionId: string; lifecycle: PageLifecycle; publishAt?: string; scheduleState?: 'scheduled'|'failed'; scheduleFailure?: string|null }
export interface BlockView { id: string; pageId: string; parentBlockId: string | null; blockType: string; content: JsonValue; treePosition: string; revisionId: string }
export interface PageDocument { page: PageRef; blocks: BlockView[]; workingRevisionId: string; publishedRevisionId: string | null; permissions: { level: AccessLevel; canEdit: boolean; canShare: boolean }; policyProfile: KnowledgePolicyProfile; verification?: JsonValue; decision?: JsonValue }
