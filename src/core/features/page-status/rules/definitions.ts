/**
 * STAT-007: the three verification rules a container owner can turn on. Each kind has
 * exactly one action, and the only actions that exist are `unverify` and `flag`: no
 * rule, automation or AI action renews verification (STAT-004). Shared by the server
 * and the settings panel; nothing here reads storage.
 */
export const ruleKinds = ['cited-changed', 'no-owner', 'unviewed'] as const;
export type RuleKind = typeof ruleKinds[number];
export type RuleAction = 'unverify' | 'flag';
export const ruleActions: Record<RuleKind, RuleAction> = { 'cited-changed': 'unverify', 'no-owner': 'flag', unviewed: 'flag' };
export const defaultUnviewedDays = 180;
export const ruleCopy: Record<RuleKind, { label: string; description: string }> = {
  'cited-changed': { label: 'Unverify when a cited page changes', description: 'A verified page that links to or mentions another page reads lapsed once that page changes after the verification.' },
  'no-owner': { label: 'Flag pages with no owner', description: 'Flags pages whose owner is unset or is no longer an active member.' },
  unviewed: { label: 'Flag verified pages nobody views', description: 'Flags verified pages with no view in the chosen number of days.' },
};

/** Why a rule changed a page; never page text. */
export type RuleReason =
  | { rule: 'cited-changed'; citedPageIds: string[] }
  | { rule: 'no-owner'; owner: 'unset' | 'inactive' }
  | { rule: 'unviewed'; days: number; lastViewedAt: string | null };

export interface RuleSettings { kind: RuleKind; action: RuleAction; days: number | null; enabled: boolean }

export class RuleInputError extends Error {
  constructor(readonly code: 'RULE_ACTION_REFUSED' | 'INVALID_RULE', message: string) { super(message); }
}

/** The one validation the route and the store both run before anything is stored. */
export function parseRuleSettings(input: unknown): RuleSettings {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (!ruleKinds.includes(value.kind as RuleKind)) throw new RuleInputError('INVALID_RULE', 'Choose cited-changed, no-owner or unviewed.');
  const kind = value.kind as RuleKind;
  if (value.action !== ruleActions[kind]) throw new RuleInputError('RULE_ACTION_REFUSED', `A ${kind} rule can only ${ruleActions[kind]}. Rules never verify a page; only a person verifies.`);
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new RuleInputError('INVALID_RULE', 'Turn the rule on or off.');
  let days: number | null = null;
  if (kind === 'unviewed') {
    days = value.days === undefined || value.days === null ? defaultUnviewedDays : Number(value.days);
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new RuleInputError('INVALID_RULE', 'Choose between 1 and 3650 days.');
  } else if (value.days !== undefined && value.days !== null) throw new RuleInputError('INVALID_RULE', 'Only the unviewed rule takes a number of days.');
  return { kind, action: ruleActions[kind], days, enabled: value.enabled === true };
}
