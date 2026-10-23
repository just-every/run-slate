import {useState} from 'react';
import {useWorkspace} from '../../../../app/ui/WorkspaceContext';
import {RequestState} from '../../../../app/ui/RequestState';
import {ActionDialog} from '../../../../app/ui/ActionDialog';
import {useResource} from '../../../../client/useResource';
import {mutate, operationKey} from '../../../../client/transport';
import type {SwitchState} from '../../../feature-switches/catalog';
import './features.css';

export function FeatureSettings() {
  const {member} = useWorkspace();
  const resource = useResource<{items: SwitchState[]}>(member.role === 'owner' ? '/api/workspace/features' : null);
  const [changing, setChanging] = useState<SwitchState>();
  if (member.role !== 'owner') return null;
  return <section className="feature-settings" aria-label="Features">
    <h2>Features</h2>
    <p>Choose what this workspace can use. Turning a feature off keeps its stored records.</p>
    <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
      {resource.data?.items.map(state => <section key={state.key} aria-label={state.label}>
        <h3>{state.label}</h3>
        <p>{state.enabled ? 'On' : 'Off'}{state.enabled && !state.effective ? ' · Unavailable' : ''}</p>
        {state.prerequisites.map(reason => <p key={reason} className="muted">{reason}</p>)}
        <p className="muted">{state.changedAt ? <>{state.changedBy?.displayName ?? 'Removed member'} · <time dateTime={state.changedAt}>{new Date(state.changedAt).toLocaleString()}</time></> : 'No owner change recorded.'}</p>
        <button className="secondary-button" disabled={!state.enabled && !state.available} onClick={() => setChanging(state)}>
          Turn {state.enabled ? 'off' : 'on'} {state.label}
        </button>
        {state.key === 'mcp' && state.effective ? <p><a href="/api/agent/tools">Available client tools</a></p> : null}
      </section>)}
    </RequestState>
    {changing ? <ActionDialog title={`Turn ${changing.enabled ? 'off' : 'on'} ${changing.label}`} action={`Turn ${changing.enabled ? 'off' : 'on'}`} onClose={() => setChanging(undefined)} onSubmit={async () => {
      await mutate('/api/workspace/features', {operationKey: operationKey(), key: changing.key, enabled: !changing.enabled}, 'PUT');
      await resource.reload();
      window.dispatchEvent(new Event('slate:features-changed'));
    }}><p>{changing.enabled ? 'New requests and scheduled work will be refused. Stored records are kept.' : 'Members can use this feature within their existing permissions.'}</p></ActionDialog> : null}
  </section>;
}
