import type { Story } from './stories';
import { RuleList } from '../../src/core/features/automation/ui/RuleList';
import { ArchiveList } from '../../src/core/features/archive/ui/ArchiveList';
import { DecisionLog } from '../../src/core/features/decisions/ui/DecisionLog';
import type { ArchivedEntry } from '../../src/core/features/archive/ui/types';
import type { RuleListRow } from '../../src/core/features/automation/ui/types';
import type { DecisionLogEntry } from '../../src/core/features/decisions/ui/types';

const act = () => { document.documentElement.dataset.lastAction = 'operation'; };
const states = ['ready', 'empty', 'error', 'denied'] as const;
const archived: ArchivedEntry[] = [{ id: 'archive-1', kind: 'page', title: '2025 launch checklist', archivedBy: { id: 'mira', name: 'Mira Chen' }, archivedAtLabel: '8 September 2026, 10:30', priorLocation: { id: 'product', label: 'Launches', trail: ['Product'], stillExists: true }, reason: 'The launch is complete. Keep the checklist for future reference.', descendantCount: 2 }];
const rules: RuleListRow[] = [{ id: 'rule-1', name: 'Notify on review', scope: 'container', scopeTargetLabel: 'Product', triggerSummary: 'Status becomes Ready', actorName: 'Mira Chen', enabled: true, lastRunLabel: 'Today, 09:12', lastRunState: 'success', disabledAfterFailure: false }];
const decisions: DecisionLogEntry[] = [{ id: 'decision-1', pageId: 'page-1', pageTitle: 'Adopt a weekly release cadence', containerLabel: 'Product', state: 'accepted', owner: { id: 'mira', name: 'Mira Chen' }, decidedAtLabel: '1 Sep 2026', reviewAtLabel: '1 Oct 2026', overdue: false, citationsCurrent: true, citationCount: 2, acceptedRevisionLabel: 'Version 4' }];

export const operationListStories: Story[] = [
  ...states.map(state => ({ id: `automation-${state}`, title: `Automation rules · ${state}`, clauses: ['AUTO-003', 'AUTO-005'], render: () => <div className="p-4"><RuleList automationScopeProfile="container" state={state} rules={state === 'ready' ? rules : []} onOpenRule={act} onToggleRule={act} onCreateRule={act} onRetry={act} onRequestAccess={act} errorDetail="The rules request failed. Try loading the list again." /></div> })),
  ...states.map(state => ({ id: `archive-${state}`, title: `Archive · ${state}`, clauses: ['ARCH-001', 'ARCH-002', 'ARCH-003'], render: () => <div className="p-4"><ArchiveList state={state} entries={state === 'ready' ? archived : []} kindFilter="all" onKindFilterChange={act} titleFilter="" onTitleFilterChange={act} onOpen={act} onRestore={act} onDelete={act} onOpenTrash={act} onRetry={act} onRequestAccess={act} onClearFilters={act} errorDetail="The archive could not be loaded. Your archived pages are unchanged." /></div> })),
  ...states.map(state => ({ id: `decisions-${state}`, title: `Decision log · ${state}`, clauses: ['DEC-003', 'DEC-004'], render: () => <div className="p-4"><DecisionLog state={state} decisions={state === 'ready' ? decisions : []} filters={{ state: 'all', containerId: 'all', ownerId: 'all', decidedFrom: '', reviewBefore: '', citations: 'all' }} onFiltersChange={act} containers={[{ id: 'product', label: 'Product' }]} owners={[{ id: 'mira', label: 'Mira Chen' }]} onOpenDecision={act} onRetry={act} onRequestAccess={act} onClearFilters={act} /></div> })),
];
