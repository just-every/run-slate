import {createContext, useContext, type ReactNode} from 'react';
import {tocEntries, type TableOfContentsSettings} from '../../table-of-contents';
import type {EditorBlock} from '../types';

const Headings = createContext<EditorBlock[]>([]);
export function DocumentHeadings({blocks,children}:{blocks:EditorBlock[];children:ReactNode}) {
  return <Headings.Provider value={blocks}>{children}</Headings.Provider>;
}
export function useDocumentHeadings(settings:TableOfContentsSettings) {
  return tocEntries(useContext(Headings).map(block=>({id:block.id,blockType:block.type,content:block})),settings);
}
