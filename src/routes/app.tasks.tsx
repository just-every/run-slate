import { createFileRoute } from '@tanstack/react-router';
import { editorLeaf } from '../editor-leaf';
import { MyTasks } from '../core/features/work-items/ui/MyTasks';
export const Route=createFileRoute('/app/tasks')({component:editorLeaf(MyTasks)});
