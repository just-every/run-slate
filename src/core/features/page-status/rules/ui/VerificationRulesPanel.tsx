import { useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../../client/transport';
import { RequestState } from '../../../../app/ui/RequestState';
import { displayDate } from '../../../../app/ui/displayDate';
import { ruleCopy, type RuleAction, type RuleKind, type RuleReason } from '../definitions';
import { reasonText } from './reason';

interface RuleView { kind: RuleKind; action: RuleAction; days: number | null; enabled: boolean; enabledAt: string | null }
interface FlagView { pageId: string; title: string; kind: RuleKind; reason: RuleReason; flaggedAt: string }
interface Preview { kind: RuleKind; action: RuleAction; pages: { pageId: string; title: string; reason: RuleReason; alreadyFlagged: boolean }[]; hidden: number }

/** STAT-007: a container owner previews and turns each nightly rule on or off. Rules only flag or unverify. */
export function VerificationRulesPanel({ containerId }: { containerId: string }) {
  const resource = useResource<{ rules: RuleView[]; flags: FlagView[]; hiddenFlags: number }>(`/api/status/rules/container/${encodeURIComponent(containerId)}`);
  const [days, setDays] = useState<Record<string, number>>({});
  const [previews, setPreviews] = useState<Partial<Record<RuleKind, Preview>>>({});
  const [error, setError] = useState<unknown>();
  const settings = (rule: RuleView) => ({ kind: rule.kind, action: rule.action, ...(rule.kind === 'unviewed' ? { days: days[rule.kind] ?? rule.days } : {}) });
  const run = async (task: () => Promise<void>) => { setError(undefined); try { await task(); } catch (cause) { setError(cause); } };
  const preview = (rule: RuleView) => run(async () => {
    const result = await mutate<Preview>(`/api/status/rules/container/${encodeURIComponent(containerId)}/preview`, settings(rule));
    setPreviews(current => ({ ...current, [rule.kind]: result }));
  });
  const toggle = (rule: RuleView) => run(async () => {
    await mutate(`/api/status/rules/container/${encodeURIComponent(containerId)}`, { operationKey: operationKey(), ...settings(rule), enabled: !rule.enabled }, 'PUT');
    resource.reload();
  });
  return <section aria-label="Verification rules" className="verification-rules">
    <h4>Verification rules</h4>
    <p className="muted">Rules run nightly and only flag or unverify; a person verifies. A rule turned on runs from the next night. Each run is recorded in activity, and each affected owner gets one notice.</p>
    <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
      <ul className="archive-list">
        {resource.data?.rules.map(rule => {
          const shown = previews[rule.kind];
          return <li key={rule.kind} data-rule={rule.kind}>
            <div>
              <h5>{ruleCopy[rule.kind].label}</h5>
              <p>{ruleCopy[rule.kind].description}</p>
              <p className="muted">{rule.enabled ? `On since ${displayDate(rule.enabledAt!, true)} · ${rule.action === 'unverify' ? 'Unverifies' : 'Flags'}` : `Off · would ${rule.action}`}</p>
              {rule.kind === 'unviewed' ? <label>Days without a view<input type="number" min={1} max={3650} value={days[rule.kind] ?? rule.days ?? 180} disabled={rule.enabled} onChange={event => setDays(current => ({ ...current, [rule.kind]: Number(event.target.value) }))}/></label> : null}
              {shown ? <div role="status" aria-label={`Preview: ${ruleCopy[rule.kind].label}`}>
                <p>{shown.pages.length + shown.hidden === 0 ? 'Tonight this rule would change no pages.' : `Tonight this rule would ${shown.action} ${shown.pages.length + shown.hidden} ${shown.pages.length + shown.hidden === 1 ? 'page' : 'pages'}:`}</p>
                <ul>{shown.pages.map(page => <li key={page.pageId}><a href={`/app/pages/${encodeURIComponent(page.pageId)}?detail=status`}>{page.title}</a> — {reasonText(page.reason)}{page.alreadyFlagged ? ' Already flagged.' : ''}</li>)}</ul>
                {shown.hidden ? <p className="muted">{shown.hidden} more {shown.hidden === 1 ? 'page' : 'pages'} you cannot open.</p> : null}
                <p className="muted">Preview only: nothing was changed.</p>
              </div> : null}
            </div>
            <div className="editor-actions">
              <button type="button" className="secondary-button" onClick={() => void preview(rule)}>Preview</button>
              <button type="button" onClick={() => void toggle(rule)}>{rule.enabled ? 'Turn off' : 'Turn on'}</button>
            </div>
          </li>;
        })}
      </ul>
      <h5>Flagged pages</h5>
      {resource.data?.flags.length ? <ul className="archive-list">{resource.data.flags.map(flag => <li key={`${flag.kind}:${flag.pageId}`}>
        <div><a href={`/app/pages/${encodeURIComponent(flag.pageId)}?detail=status`}>{flag.title}</a><p>{ruleCopy[flag.kind].label} · {reasonText(flag.reason)}</p></div>
        <button type="button" className="secondary-button" onClick={() => void run(async () => { await mutate(`/api/status/rules/page/${encodeURIComponent(flag.pageId)}/dismiss`, { operationKey: operationKey(), kind: flag.kind }); resource.reload(); })}>Dismiss</button>
      </li>)}</ul> : <p>No flagged pages.</p>}
      {resource.data?.hiddenFlags ? <p className="muted">{resource.data.hiddenFlags} flagged {resource.data.hiddenFlags === 1 ? 'page' : 'pages'} you cannot open.</p> : null}
    </RequestState>
    {error ? <p role="alert">{errorMessage(error)}</p> : null}
  </section>;
}
