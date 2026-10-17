import type {JsonValue} from '../../shared/api/common';
import type {ImportedBlock, ImportReportEntry} from './types';

type CanonicalBlock = NonNullable<ImportedBlock['canonicalBlock']>;
const object = (value: JsonValue | undefined): value is {[key: string]: JsonValue} => !!value && typeof value === 'object' && !Array.isArray(value);

/** A missing filter must remain closed, including when reimporting into the source workspace. */
export function readableBlock(block: CanonicalBlock, pageIds: Set<string>, warnings: ImportReportEntry[]): ImportedBlock {
  const canonicalBlock = {...block, content: structuredClone(block.content)};
  const canonicalReferences: NonNullable<ImportedBlock['canonicalReferences']> = {};
  if (block.blockType === 'task-report' && object(canonicalBlock.content) && object(canonicalBlock.content.definition)) {
    const definition = canonicalBlock.content.definition;
    const unavailable = (kind: string, sourceId: string) => {
      warnings.push({kind: 'construct', sourceId: block.id, label: 'Task report source unavailable', detail: `The readable archive contains no mapped ${kind} identity for ${sourceId}. The filter was retained as unavailable, never removed.`});
      return `unavailable:readable:${kind}:${sourceId.slice(0, 110)}`;
    };
    if (typeof definition.ancestorPageId === 'string') {
      if (pageIds.has(definition.ancestorPageId)) canonicalReferences.ancestorPageSourceId = definition.ancestorPageId;
      else definition.ancestorPageId = unavailable('page', definition.ancestorPageId);
    }
    if (typeof definition.containerId === 'string') definition.containerId = unavailable('container', definition.containerId);
    if (typeof definition.creatorMemberId === 'string') definition.creatorMemberId = unavailable('member', definition.creatorMemberId);
    if (object(definition.assignee) && definition.assignee.kind === 'member' && typeof definition.assignee.memberId === 'string') definition.assignee.memberId = unavailable('member', definition.assignee.memberId);
  }
  return {sourceId: block.id, sourceIdentityKind: 'native', kind: 'paragraph', mediaSourceId: (object(block.content) && object(block.content.source) && typeof block.content.source.fileId === 'string') ? block.content.source.fileId : undefined, links: [], children: [], canonicalBlock, ...(Object.keys(canonicalReferences).length ? {canonicalReferences} : {})};
}
