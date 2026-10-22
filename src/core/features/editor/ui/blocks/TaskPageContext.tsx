import { createContext, useContext, type ReactNode } from 'react';
import { useResource } from '../../../../client/useResource';

export interface TaskPerson { id: string; displayName: string; canRead: boolean }
const TaskPageContext = createContext<{pageId:string;revisionId?:string;canShare:boolean;people:TaskPerson[];reload:()=>Promise<boolean>} | null>(null);
export function TaskPageProvider({pageId,revisionId,canShare,children}:{pageId:string;revisionId?:string;canShare:boolean;children:ReactNode}) {
  const people=useResource<{items:TaskPerson[]}>(`/api/tasks/${encodeURIComponent(pageId)}/assignees`);
  return <TaskPageContext.Provider value={{pageId,revisionId,canShare,people:people.data?.items??[],reload:people.reload}}>{children}</TaskPageContext.Provider>;
}
export const useTaskPage=()=>useContext(TaskPageContext);
