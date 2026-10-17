import { createContext, useContext, type ReactNode } from 'react';
import { useResource } from '../../../../client/useResource';

export interface TaskPerson { id: string; displayName: string; canRead: boolean }
const TaskPageContext = createContext<{pageId:string;canShare:boolean;people:TaskPerson[];reload:()=>Promise<boolean>} | null>(null);
export function TaskPageProvider({pageId,canShare,children}:{pageId:string;canShare:boolean;children:ReactNode}) {
  const people=useResource<{items:TaskPerson[]}>(`/api/tasks/${encodeURIComponent(pageId)}/assignees`);
  return <TaskPageContext.Provider value={{pageId,canShare,people:people.data?.items??[],reload:people.reload}}>{children}</TaskPageContext.Provider>;
}
export const useTaskPage=()=>useContext(TaskPageContext);
