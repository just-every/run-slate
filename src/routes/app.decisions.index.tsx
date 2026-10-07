import {createFileRoute} from '@tanstack/react-router';
import {DecisionWorkspace} from '../core/features/decisions/ui/DecisionWorkspace';
export const Route=createFileRoute('/app/decisions/')({component:DecisionWorkspace});
