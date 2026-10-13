import {editorLeaf} from "../editor-leaf";
import {createFileRoute} from '@tanstack/react-router';
import {DecisionWorkspace} from '../core/features/decisions/ui/DecisionWorkspace';
export const Route=createFileRoute('/app/decisions/$decisionId')({component:()=>{const {decisionId}=Route.useParams();return <DecisionWorkspace id={decisionId}/>;}});
