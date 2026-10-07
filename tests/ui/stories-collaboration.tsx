import { useState } from 'react';
import type { Story } from './stories';
import { DiscussionsPanel, type DiscussionsPanelProps } from '../../src/core/features/comments/ui/DiscussionsPanel';
import { SharePanel, type SharePanelProps } from '../../src/core/features/sharing/ui/SharePanel';
import { InboxPanel, type InboxPanelProps } from '../../src/core/features/notifications/ui/InboxPanel';
import { documentCollaborationStories } from './stories-collaboration-documents';

const action = () => { document.documentElement.dataset.lastAction = 'collaboration-action'; };
const person = { id: 'maya', name: 'Maya Chen', initials: 'MC' };
function DiscussionsStory({ state }: { state: DiscussionsPanelProps['state'] }) {
  const [filter, setFilter] = useState<DiscussionsPanelProps['filter']>({ kind: 'all', status: 'all', personId: 'all' });
  return <div className="h-[720px]"><DiscussionsPanel state={state} pageTitle="Team working agreement" filter={filter} onFilterChange={setFilter} people={[person]} viewerAccess="comment" selectedThreadId="thread-1"
    threads={[{ id: 'thread-1', status: 'open', anchor: { kind: 'inline', blockId: 'paragraph-1', quotedText: 'We share decisions before Friday.', orphanedIn: null }, comments: [{ id: 'comment-1', author: person, createdAtLabel: 'Today at 9:14 AM', editedAtLabel: null, body: 'Could we include the decision owner in each update?', deletedAtLabel: null, isOwn: false, reactions: [{ emoji: '👍', reactors: [person], reactedByViewer: true }], attachments: [] }] }]}
    errorDetail="The discussion request timed out. Your draft is still available." onResolveAll={action} onSelectThread={action} onStartPageThread={action} onRetry={action} onClose={action} onReply={action} onResolve={action} onReopen={action} onEditComment={action} onDeleteComment={action} onToggleReaction={action} onAddReaction={action} onMention={action} onAttach={action} onOpenRevision={action} /></div>;
}
function SharingStory({ state }: { state: SharePanelProps['state'] }) {
  const [value, setValue] = useState('');
  return <SharePanel state={state} accessProfile="workspace-general" canChangeAccess offeredLevels={['view', 'comment', 'edit', 'full']} tab="share" onTabChange={action}
    invite={{ value, onValueChange: setValue, level: 'view', onLevelChange: action, onInvite: action }}
    grants={[
      { id: 'self', principal: { kind: 'member', id: 'maya', name: 'Maya Chen', detail: 'maya@example.test' }, level: 'full', origin: 'page', isSelf: true },
      { id: 'team', principal: { kind: 'group', id: 'design', name: 'Design team', detail: '6 members' }, level: 'edit', origin: 'inherited', inheritedFrom: { kind: 'container', name: 'Product' } },
      { id: 'guest', principal: { kind: 'member', id: 'lee', name: 'Lee Morgan', detail: 'lee@example.test' }, level: 'comment', origin: 'page', expired: true, expiresAt: '2026-09-01T00:00:00Z' },
    ]}
    onGrantLevelChange={action} onGrantRemove={action} onGrantRegrant={action}
    generalAccess={{ workspace: { id: 'workspace', name: 'Acme' }, container: { id: 'product', name: 'Product', visibility: 'open' }, level: 'view', onLevelChange: action, onRestrict: action, onOpenGeneralAccess: action }}
    publishSlot={null} onCopyLink={action} onRequestAccess={action} onRetry={action} errorDetail="Access grants could not be retrieved." />;
}
function InboxStory({ state }: { state: InboxPanelProps['state'] }) {
  const [view, setView] = useState<InboxPanelProps['view']>('addressed');
  return <div className="h-[640px]"><InboxPanel state={state} view={view} onViewChange={setView} unreadCount={state === 'ready' ? 2 : 0} kindFilter="all" onKindFilterChange={action}
    periods={[{ id: 'today', label: 'Today', entries: [
      { id: 'mention', kind: 'mention', actor: person, pageTitle: 'Team working agreement', pageTrail: ['Product', 'Ways of working'], snippet: 'Maya, can you review the decision ownership section?', timeLabel: '12 minutes ago', read: false, resolved: false, commentId: 'comment-1', recordId: 'page-1' },
      { id: 'review', kind: 'ai-review', actor: null, pageTitle: 'Customer interview notes', pageTrail: ['Research'], snippet: 'A summary is ready for your review.', timeLabel: '1 hour ago', read: false, resolved: false, commentId: null, recordId: 'page-2' },
      { id: 'reply', kind: 'reply', actor: { id: 'lee', name: 'Lee Morgan' }, pageTitle: 'Launch checklist', pageTrail: ['Product'], snippet: 'The checklist is now up to date.', timeLabel: '3 hours ago', read: true, resolved: true, commentId: 'comment-2', recordId: 'page-3' },
    ] }]} onOpenNotification={action} onMarkAllRead={action} onArchiveRead={action} onClose={action} onRetry={action} errorDetail="The inbox request timed out. Try again." /></div>;
}
export const collaborationStories: Story[] = [
  ...(['ready', 'empty', 'error', 'denied'] as const).map(state => ({ id: `comments-${state}`, title: `Discussions · ${state}`, clauses: ['COMM-001', 'COMM-006'], render: () => <DiscussionsStory state={state} /> })),
  ...(['ready', 'denied', 'error'] as const).map(state => ({ id: `sharing-${state}`, title: `Sharing · ${state}`, clauses: ['SHARE-001', 'SHARE-002', 'SHARE-008'], render: () => <SharingStory state={state} /> })),
  ...(['ready', 'empty', 'error'] as const).map(state => ({ id: `notifications-${state}`, title: `Inbox · ${state}`, clauses: ['NOTIF-001', 'NOTIF-002'], render: () => <InboxStory state={state} /> })),
  ...documentCollaborationStories,
];
