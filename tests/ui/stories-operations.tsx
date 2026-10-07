import type { Story } from './stories';
import { operationListStories } from './stories-operation-lists';
import { operationNoticeStories } from './stories-operation-notices';

export const operationsStories: Story[] = [...operationListStories, ...operationNoticeStories];
