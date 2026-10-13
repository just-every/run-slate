import {editorLeaf} from "../editor-leaf";
import {createFileRoute} from '@tanstack/react-router';
import {ContainerWorkspace} from '../core/features/containers/ui/workspace/ContainerWorkspace';
export const Route=createFileRoute('/app/containers/$containerId')({component:()=>{const {containerId}=Route.useParams();return <ContainerWorkspace containerId={containerId}/>;}});
