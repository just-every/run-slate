import { useState } from 'react';
import { ContainerHome } from '../../src/core/features/containers/ui/ContainerHome';
import { WorkspaceIdentitySection } from '../../src/core/features/workspace-settings/ui/WorkspaceIdentitySection';
import { MembersSection } from '../../src/core/features/workspace-settings/ui/MembersSection';
import { SettingsShell, workspaceSettingsNav } from '../../src/core/features/workspace-settings/ui/SettingsShell';
import { SignInScreen, type SignInScreenState } from '../../src/core/features/session/ui/SignInScreen';
import { FirstRunWizard } from '../../src/core/features/session/ui/FirstRunWizard';
import type { SurfaceState } from '../../src/core/ui';
import type { Story } from './stories';

// Fixture callbacks record UI intent only; these component stories never call a service.
const record = (action: string) => { document.documentElement.dataset.lastAction = action; };
const content = [
  { id: 'working-agreement', icon: '🤝', title: 'Team working agreement', ownerName: 'Rosa Medina', updatedAtLabel: 'Today, 9:42 am', statusLabel: 'Verified' },
  { id: 'escalations', icon: '📋', title: 'How we handle an escalation', ownerName: 'Daniel Okafor', updatedAtLabel: 'Yesterday', statusLabel: 'In review' },
  { id: 'research', icon: '🔎', title: 'Customer research — September', ownerName: 'Amelia Chen', updatedAtLabel: '9 September', statusLabel: null },
];
function ContainerStory({ state }: { state: SurfaceState }) {
  const [query, setQuery] = useState('');
  return <ContainerHome state={state} container={{ id: 'customer-success', icon: '📚', name: 'Customer Success', description: 'Shared practices, customer research and decisions for our support team.', key: 'CS', visibility: 'open', memberCount: 12 }}
    pageTree={null} content={state === 'ready' ? content : []} searchQuery={query} onSearchQueryChange={setQuery}
    onSearch={() => record('container-search')} onOpenPage={id => record(`open-${id}`)} onCreatePage={() => record('create-page')}
    onOpenSettings={() => record('container-settings')} onRetry={() => record('retry-container')} errorDetail="The workspace connection was interrupted. Try loading these pages again." />;
}
function IdentityStory({ denied = false, failed = false }: { denied?: boolean; failed?: boolean }) {
  const [name, setName] = useState('Northwind Field Operations');
  const [mark, setMark] = useState('N');
  const [dirty, setDirty] = useState(failed);
  return <SettingsShell groups={workspaceSettingsNav} selectedId="identity" onSelect={id => record(`settings-${id}`)}>
    <WorkspaceIdentitySection name={name} mark={mark} onNameChange={next => { setName(next); setDirty(true); }}
      onMarkChange={next => { setMark(next); setDirty(true); }} dirty={dirty} canEdit={!denied}
      onSave={() => { record('save-identity'); setDirty(false); }} onCancel={() => { setName('Northwind Field Operations'); setMark('N'); setDirty(false); }}
      failure={failed ? 'The server could not commit the change. Your name and mark are still here to retry.' : null} />
  </SettingsShell>;
}
function MembersStory({ state }: { state: SurfaceState }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'member'>('member');
  return <SettingsShell groups={workspaceSettingsNav} selectedId="members" onSelect={id => record(`settings-${id}`)}>
    <MembersSection state={state} viewer={{ memberId: 'rosa', role: 'owner' }} members={state === 'ready' ? [
      { id: 'rosa', name: 'Rosa Medina', email: 'rosa@example.com', role: 'owner', avatarUrl: null, joinedOn: '3 February 2026', isSetupMember: true },
      { id: 'daniel', name: 'Daniel Okafor', email: 'daniel@example.com', role: 'member', avatarUrl: null, joinedOn: '5 February 2026', isSetupMember: false },
    ] : []} invitations={state === 'ready' ? [
      { id: 'inv-amelia', email: 'amelia@example.com', role: 'member', sentOn: '12 September 2026', expiresOn: '13 September 2026', state: 'pending', deliveryError: null, invitedByName: 'Rosa Medina' },
      { id: 'inv-jules', email: 'jules@example.com', role: 'member', sentOn: '9 September 2026', expiresOn: '10 September 2026', state: 'expired', deliveryError: null, invitedByName: 'Rosa Medina' },
    ] : []} inviteEmail={email} onInviteEmailChange={setEmail} inviteRole={role} onInviteRoleChange={setRole}
      onInvite={() => record('invite-member')} onRoleChange={id => record(`role-${id}`)} onRemove={id => record(`remove-${id}`)}
      onRevokeInvitation={id => record(`revoke-${id}`)} onRetry={() => record('retry-members')} errorDetail="Member information could not be loaded. Please retry." />
  </SettingsShell>;
}
function SignInStory({ state, submitting = false }: { state: SignInScreenState; submitting?: boolean }) {
  const [email, setEmail] = useState('rosa@example.com');
  return <SignInScreen state={state} email={email} onEmailChange={setEmail} onSubmit={() => record('request-signin')}
    onUseAnotherAddress={() => { setEmail(''); record('another-address'); }} submitting={submitting}
    deliveryError={state === 'delivery-failed' ? 'Mail provider: delivery rejected (503 Service Unavailable)' : null}
    productName="Slate" productMark="S" />;
}
function FirstRunStory({ step, failure = false }: { step: 1 | 2 | 3; failure?: boolean }) {
  const [workspace, setWorkspace] = useState('Northwind Field Operations');
  const [container, setContainer] = useState('Customer Success');
  const [page, setPage] = useState('How we handle an escalation');
  const [addresses, setAddresses] = useState('daniel@example.com\namelia@example.com');
  return <FirstRunWizard step={step} workspaceName={workspace} onWorkspaceNameChange={setWorkspace}
    containerName={container} onContainerNameChange={setContainer} firstPageTitle={page} onFirstPageTitleChange={setPage}
    invitationAddresses={addresses} onInvitationAddressesChange={setAddresses} onBack={() => record('setup-back')}
    onNext={() => record('setup-next')} onSkipInvitations={() => record('skip-invitations')} onFinish={() => record('finish-setup')}
    failure={failure ? 'The mail provider is unavailable. You can skip invitations and invite people later.' : null} />;
}
export const workspaceStories: Story[] = [
  ...(['ready', 'loading', 'empty', 'error', 'denied'] as SurfaceState[]).map(state => ({ id: `container-${state}`, title: `Container · ${state}`, clauses: ['CONT-001', 'CONT-003', 'SEARCH-006'], render: () => <ContainerStory state={state} /> })),
  { id: 'workspace-identity-ready', title: 'Workspace identity · ready', clauses: ['WORK-001', 'WORK-011'], render: () => <IdentityStory /> },
  { id: 'workspace-identity-denied', title: 'Workspace identity · read only', clauses: ['WORK-008'], render: () => <IdentityStory denied /> },
  { id: 'workspace-identity-error', title: 'Workspace identity · save failed', clauses: ['WORK-001'], render: () => <IdentityStory failed /> },
  ...(['ready', 'loading', 'empty', 'error'] as SurfaceState[]).map(state => ({ id: `workspace-members-${state}`, title: `Workspace members · ${state}`, clauses: ['WORK-003', 'WORK-006', 'WORK-007'], render: () => <MembersStory state={state} /> })),
  ...(['request', 'sent', 'link-expired', 'delivery-failed'] as SignInScreenState[]).map(state => ({ id: `session-signin-${state}`, title: `Sign in · ${state}`, clauses: ['BASE-ACCESS-001', 'WORK-015'], render: () => <SignInStory state={state} /> })),
  { id: 'session-signin-loading', title: 'Sign in · sending', clauses: ['BASE-ACCESS-001'], render: () => <SignInStory state="request" submitting /> },
  ...([1, 2, 3] as const).map(step => ({ id: `session-first-run-${step}`, title: `First run · step ${step}`, clauses: ['WORK-013'], render: () => <FirstRunStory step={step} /> })),
  { id: 'session-first-run-error', title: 'First run · invitations failed', clauses: ['WORK-013'], render: () => <FirstRunStory step={3} failure /> },
];
