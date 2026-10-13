import { useState } from 'react';
import { SignInScreen, type SignInScreenState } from '../../src/core/features/session/ui/SignInScreen';
import { FirstRunWizard } from '../../src/core/features/session/ui/FirstRunWizard';
import type { Story } from './stories';
import { settingsSectionStories } from './stories-settings-section';

// Fixture callbacks record UI intent only; these component stories never call a service.
const record = (action: string) => { document.documentElement.dataset.lastAction = action; };
function SignInStory({ state, submitting = false }: { state: SignInScreenState; submitting?: boolean }) {
  const [email, setEmail] = useState('rosa@example.com');
  return <SignInScreen state={state} email={email} onEmailChange={setEmail} onSubmit={() => record('request-signin')}
    onUseAnotherAddress={() => { setEmail(''); record('another-address'); }} submitting={submitting}
    deliveryError={state === 'delivery-failed' ? 'Mail provider: delivery rejected (503 Service Unavailable)' : null} />;
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
  ...settingsSectionStories,
  ...(['request', 'sent', 'link-expired', 'delivery-failed'] as SignInScreenState[]).map(state => ({ id: `session-signin-${state}`, title: `Sign in · ${state}`, clauses: ['BASE-ACCESS-001', 'WORK-015'], render: () => <SignInStory state={state} /> })),
  { id: 'session-signin-loading', title: 'Sign in · sending', clauses: ['BASE-ACCESS-001'], render: () => <SignInStory state="request" submitting /> },
  ...([1, 2, 3] as const).map(step => ({ id: `session-first-run-${step}`, title: `First run · step ${step}`, clauses: ['WORK-013'], render: () => <FirstRunStory step={step} /> })),
  { id: 'session-first-run-error', title: 'First run · invitations failed', clauses: ['WORK-013'], render: () => <FirstRunStory step={3} failure /> },
];
