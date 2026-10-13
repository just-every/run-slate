import {type ComponentType} from 'react';
import {useLocation} from '@tanstack/react-router';
import {useEditorLeafReady} from './editor/react';
export function editorLeaf(Component: ComponentType) {
  return function EditorLeaf() {
    const location = useLocation();
    useEditorLeafReady(location.pathname);
    return <Component />;
  };
}
