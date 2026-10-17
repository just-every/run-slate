import { useRef } from 'react';
import { ActionDialog } from '../../../app/ui/ActionDialog';
import { RequestState } from '../../../app/ui/RequestState';
import { useResource } from '../../../client/useResource';
import { mutate, operationKey } from '../../../client/transport';
import type { CompanyHubConfiguration, ContainerHomeConfiguration, HomePageChoice } from '../types';

type Configuration = (ContainerHomeConfiguration | CompanyHubConfiguration) & { revisionId: string | null };
export function HomeConfiguration({ containerId, configuration, onClose, onSaved }: {
  containerId?: string;
  configuration: Configuration;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const choices = useResource<{ items: HomePageChoice[] }>(`/api/homes/choices${containerId ? `?containerId=${encodeURIComponent(containerId)}` : ''}`);
  const attempt = useRef<{ request: string; key: string } | null>(null);
  const hub = !containerId;
  const hubConfiguration = 'linkPageIds' in configuration ? configuration : undefined;
  const homeChoices = choices.data?.items.filter(page => page.homeEligible && (!hub || page.workspaceReadable)) ?? [];
  const unavailable = !!configuration.pageId && !homeChoices.some(page => page.id === configuration.pageId);
  return <ActionDialog title={hub ? 'Curate company hub' : 'Choose space home'} action="Save home" onClose={onClose} onSubmit={async data => {
    if (!choices.data || choices.error) throw new Error('Load the available pages before saving.');
    const selected = String(data.get('pageId'));
    if (selected === 'unavailable') throw new Error('Choose a replacement page, or choose None to clear this home.');
    const pageId = selected || null;
    const value = {
      expectedRevisionId: configuration.revisionId, pageId,
      ...(hub ? {
        linkPageIds: pageId ? data.getAll('linkPageIds').map(String) : [],
        keyPageIds: pageId ? data.getAll('keyPageIds').map(String) : [],
      } : {}),
    };
    const request = JSON.stringify(value);
    const currentAttempt = attempt.current?.request === request ? attempt.current : { request, key: operationKey() };
    attempt.current = currentAttempt;
    await mutate(containerId ? `/api/homes/containers/${encodeURIComponent(containerId)}` : '/api/homes/company-hub', { ...value, operationKey: currentAttempt.key }, 'PUT');
    await onSaved();
  }}>
    <p>{hub ? 'Choose an existing page shared with the workspace. Every member can open it from Home. Links and key pages appear only to readers who can access them.' : 'Choose an existing published page in this space. Its normal editing and sharing permissions stay in effect.'}</p>
    <RequestState loading={choices.loading} error={choices.error} retry={choices.reload}>
      {choices.data ? <>
        {unavailable ? <p role="status">The current home is unavailable{hub ? ' or is no longer shared with the workspace' : ''}. Choose a replacement or clear it.</p> : null}
        <label>{hub ? 'Company hub page' : 'Space home page'}<select name="pageId" defaultValue={unavailable ? 'unavailable' : configuration.pageId ?? ''}>
          {unavailable ? <option value="unavailable" disabled>Choose a replacement</option> : null}
          <option value="">None</option>
          {homeChoices.map(page => <option value={page.id} key={page.id}>{page.title}</option>)}
        </select></label>
        {homeChoices.length === 0 ? <p>{hub ? 'No published page is shared with the workspace yet.' : 'No published page is available in this space yet.'}</p> : null}
        {hub ? <>
          <p>To use another page as the hub, open that page and use Share to give the workspace access, then reload these choices.</p>
          <button type="button" onClick={() => void choices.reload()}>Reload page choices</button>
          <fieldset><legend>Chosen links</legend>
            {choices.data.items.map(page => <label key={page.id}><input type="checkbox" name="linkPageIds" value={page.id} defaultChecked={hubConfiguration?.linkPageIds.includes(page.id)} />{page.title}</label>)}
          </fieldset>
          <fieldset><legend>Verified key pages</legend>
            {choices.data.items.filter(page => page.verified).map(page => <label key={page.id}><input type="checkbox" name="keyPageIds" value={page.id} defaultChecked={hubConfiguration?.keyPageIds.includes(page.id)} />{page.title}</label>)}
            {!choices.data.items.some(page => page.verified) ? <p>Verify a published page to include it here.</p> : null}
          </fieldset>
          <p className="muted">Only the available selections shown here are saved. A key page leaves the hub when its verification is no longer current or no longer matches its published revision.</p>
        </> : null}
      </> : null}
    </RequestState>
  </ActionDialog>;
}
