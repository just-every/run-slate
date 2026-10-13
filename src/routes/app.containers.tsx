import {editorLeaf} from "../editor-leaf";
import {createFileRoute, Outlet} from '@tanstack/react-router';
export const Route=createFileRoute('/app/containers')({component:Outlet});
