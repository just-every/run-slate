import type { Story } from './stories';
import { SettingsSection } from '../../src/core/features/workspace-settings/ui/SettingsSection';
import { Button, EmptyState, ErrorState, LoadingState } from '../../src/core/ui';
const action = () => { document.documentElement.dataset.lastAction = 'settings-section-action'; };
export const settingsSectionStories: Story[] = [
  { id: 'settings-section-identity', title: 'Settings section · identity heading', clauses: [], render: () => <main className="p-6"><h1 className="mb-6 text-h1">Workspace settings</h1><SettingsSection title="Workspace identity" description="The name and mark every member sees in the app header." action={<Button onClick={action}>Section action</Button>}><p>Settings section content</p></SettingsSection></main> },
  ...(['ready', 'loading', 'empty', 'error'] as const).map(state => ({ id: `settings-section-members-${state}`, title: `Settings section · members ${state}`, clauses: [], render: () => <main className="p-6"><h1 className="mb-6 text-h1">Workspace settings</h1><SettingsSection title="Members" description="Everyone who signs in to this workspace.">
    {state === 'ready' ? <div><h3 className="text-ui font-medium">Section subheading</h3><p>Settings section content</p></div> : null}
    {state === 'loading' ? <LoadingState className="px-0" rows={5} /> : null}
    {state === 'empty' ? <EmptyState title="This workspace has no members yet." /> : null}
    {state === 'error' ? <ErrorState title="Slate could not load the member list." detail="Member information could not be loaded. Please retry." onRetry={action} /> : null}
  </SettingsSection></main> })),
];
