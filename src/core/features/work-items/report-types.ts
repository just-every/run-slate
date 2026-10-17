import type { TaskItem } from './ui/taskTypes';

export interface TaskReportItem extends TaskItem {
  assigneeDisplayName: string | null;
}

export interface TaskReportGroup {
  key: string;
  label: string;
  items: TaskReportItem[];
}

export interface TaskReportResult {
  items: TaskReportItem[];
  groups: TaskReportGroup[];
  ranAt: string;
}
