import { useResource } from '../../../../client/useResource';
import { mutate, operationKey } from '../../../../client/transport';
import { displayDate } from '../../../../app/ui/displayDate';
import { ruleCopy, type RuleKind, type RuleReason } from '../definitions';
import { reasonText } from './reason';

interface PageRules { flags: { kind: RuleKind; reason: RuleReason; flaggedAt: string; canDismiss: boolean }[]; ended: { at: string; reason: RuleReason } | null }

/** STAT-007 on the page's status panel: active rule flags (not verification) and a verification a rule ended. */
export function PageRuleFlags({ pageId }: { pageId: string }) {
  const resource = useResource<PageRules>(`/api/status/rules/page/${encodeURIComponent(pageId)}`);
  if (!resource.data || (!resource.data.flags.length && !resource.data.ended)) return null;
  return <section aria-label="Verification rule flags">
    {resource.data.ended ? <p>A verification rule ended this verification on {displayDate(resource.data.ended.at, true)}: {reasonText(resource.data.ended.reason)} Verify again after reviewing it.</p> : null}
    <ul className="archive-list">{resource.data.flags.map(flag => <li key={flag.kind}>
      <div><strong>Flagged: {ruleCopy[flag.kind].label}</strong><p>{reasonText(flag.reason)} Flagged {displayDate(flag.flaggedAt, true)}.</p></div>
      {flag.canDismiss ? <button type="button" className="secondary-button" onClick={() => void mutate(`/api/status/rules/page/${encodeURIComponent(pageId)}/dismiss`, { operationKey: operationKey(), kind: flag.kind }).then(resource.reload)}>Dismiss flag</button> : null}
    </li>)}</ul>
  </section>;
}
