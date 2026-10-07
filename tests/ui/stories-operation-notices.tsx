import type { Story } from './stories';
import { AiPanel } from '../../src/core/features/ai/ui/AiPanel';
import { DraftBanner } from '../../src/core/features/lifecycle/ui/DraftBanner';
import { ScheduledNotice } from '../../src/core/features/lifecycle/ui/ScheduledNotice';
import { VerificationBadge } from '../../src/core/features/page-status/ui/VerificationBadge';
import { LapsedVerificationNotice } from '../../src/core/features/page-status/ui/LapsedVerificationNotice';

const act = () => { document.documentElement.dataset.lastAction = 'operation'; };
export const operationNoticeStories: Story[] = [
  ...(['ready', 'off', 'failed', 'over-budget', 'running', 'needs-review'] as const).map(state => ({
    id: `ai-${state}`, title: `Ask AI · ${state}`, clauses: ['AI-001', 'AI-002', 'AI-004', 'AI-008', 'AI-012', 'AI-015'],
    render: () => <div className="h-[680px] max-h-screen"><AiPanel state={state} messages={state === 'ready' ? [{ id: 'question', author: 'member', authorName: 'Mira Chen', text: 'When do we review the release plan?' }, { id: 'answer', author: 'assistant', authorName: 'Slate AI', text: 'The team reviews the release plan each Monday before the weekly planning meeting.', citations: [{ id: 'source', pageTitle: 'Release working agreement', revisionLabel: 'Version 4', containerLabel: 'Product', excerpt: 'Review the release plan each Monday before planning.' }] }] : []} draft="" onDraftChange={act} onSend={act} onOpenRevision={act} providerLabel="Workspace AI" scopeLabel="Product" viewerIsWorkspaceOwner onOpenAiSettings={act} failureReason="transport" failureDetail="The provider connection closed before a response arrived." onRetry={act} onDismissFailure={act} budgetDetail="$20.00 of the $20.00 monthly budget is reserved or used." runElapsedLabel="12 seconds" onCancelRun={act} proposalSummary="A shorter introduction is ready to review." onReviewProposal={act} /></div>,
  })),
  { id: 'lifecycle-draft', title: 'Lifecycle · private draft', clauses: ['LIFE-002'], render: () => <div className="p-4"><DraftBanner authorName="Mira Chen" sharedWith={[]} onShare={act} /></div> },
  ...(['scheduled', 'failed'] as const).map(state => ({ id: `lifecycle-${state}`, title: `Lifecycle · ${state}`, clauses: ['LIFE-004'], render: () => <div className="p-4"><ScheduledNotice scheduledFor="14 September 2026, 09:00" state={state} failureDetail={state === 'failed' ? 'The publishing job could not reach storage.' : undefined} onCancel={act} onEditSchedule={act} onPublishNow={act} /></div> })),
  ...([true, false] as const).map(current => ({ id: `page-status-${current ? 'verified' : 'stale'}`, title: `Page status · ${current ? 'verified' : 'stale revision'}`, clauses: ['STAT-003'], render: () => <div className="p-4"><VerificationBadge ownerName="Mira Chen" verifiedAt="1 September 2026" expiresAt="1 October 2026" revisionLabel="Version 4" isCurrentRevision={current} onOpenVerifiedRevision={act} onVerifyCurrent={act} /></div> })),
  { id: 'page-status-lapsed', title: 'Page status · lapsed verification', clauses: ['STAT-004'], render: () => <div className="p-4"><LapsedVerificationNotice ownerName="Mira Chen" statusLabel="Verified" lapsedAt="10 September 2026" revisionLabel="Version 4" notifiedAt="10 September 2026, 09:00" onVerifyAgain={act} /></div> },
];
