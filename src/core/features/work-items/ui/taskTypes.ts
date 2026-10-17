import type { RichText } from '../../editor/ui/types';
export interface TaskItem {
  pageId:string;blockId:string;blockRevisionId:string;pageTitle:string;
  containerId:string;containerName:string;text:RichText;done:boolean;
  assigneeMemberId:string|null;dueDate:string|null;creatorMemberId:string|null;
  completedByMemberId:string|null;completedAt:string|null;canEdit:boolean;
}
export interface TaskList {items:TaskItem[];nextCursor?:string}
