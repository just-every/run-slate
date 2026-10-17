import type { BlockInput } from '../../pages/types';
import type { TemplateSnapshot } from '../snapshots';
import type { TemplateApplicationDefaults } from '../application-defaults';

export interface StarterTemplate {
  key: string;
  title: string;
  description: string;
  category: string;
  snapshot: TemplateSnapshot;
}

type AuthoredBlock = Pick<BlockInput, 'blockType' | 'content'>;
const rich = (text: string) => [{ text }];
export const heading = (text: string): AuthoredBlock => ({ blockType: 'heading', content: { level: 2, text: rich(text) } });
export const paragraph = (text: string): AuthoredBlock => ({ blockType: 'paragraph', content: { text: rich(text) } });
export const note = (text: string): AuthoredBlock => ({ blockType: 'callout', content: { tone: 'neutral', text: rich(text) } });
export const task = (text: string): AuthoredBlock => ({ blockType: 'task', content: { text: rich(text), done: false, assigneeMemberId: null, dueDate: null } });
export const table = (columns: string[]): AuthoredBlock => ({ blockType: 'table', content: { columns, rows: [{ id: 'blank', cells: columns.map(() => '') }] } });
export const taskReport = (): AuthoredBlock => ({ blockType: 'task-report', content: { definition: { state: 'open', groupBy: 'page', orderBy: 'due', direction: 'asc', limit: 20 } } });

/** These are authoring prompts. They contain no example people, provider records or completed work. */
export function starter(
  key: string,
  title: string,
  description: string,
  category: string,
  blocks: AuthoredBlock[],
  applicationDefaults?: TemplateApplicationDefaults,
): StarterTemplate {
  return {
    key, title, description, category,
    snapshot: {
      title,
      properties: { icon: null, coverFileId: null, labels: [], typeface: 'default', smallText: false, fullWidth: false },
      blocks: blocks.map((block, index) => ({ ...block, id: `${key}:${index}`, parentBlockId: null, treePosition: String(index).padStart(4, '0') })),
      children: [],
      ...(applicationDefaults ? { applicationDefaults } : {}),
    },
  };
}
