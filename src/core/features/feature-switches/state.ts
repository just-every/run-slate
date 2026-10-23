import type {RuntimeBindings} from '../../platform/config/runtime';
import {featureCatalogue, featureKeys, type FeatureKey, type SwitchKey, type SwitchState} from './catalog';

interface Row {switch_key: SwitchKey; enabled: number; changed_by_member_id: string | null; display_name: string | null; changed_at: string}
export function providerConfigured(config: RuntimeBindings): boolean {
  return config.AI_PROVIDER === 'local-codex'
    ? !!(config.AI_LOCAL_URL?.trim() && config.AI_LOCAL_TOKEN?.trim() && config.AI_MODEL?.trim())
    : !!(config.AI_API_KEY?.trim() && config.AI_MODEL?.trim());
}

/** Every request reads current rows. Missing overrides always mean off. */
export async function switchStates(db: D1Database, workspaceId: string, config: RuntimeBindings): Promise<SwitchState[]> {
  const [workspace, rows] = await Promise.all([
    db.prepare('SELECT ai_enabled FROM workspaces WHERE id=?').bind(workspaceId).first<{ai_enabled: number}>(),
    db.prepare('SELECT s.*,m.display_name FROM workspace_feature_switches s LEFT JOIN members m ON m.id=s.changed_by_member_id AND m.workspace_id=s.workspace_id WHERE s.workspace_id=?').bind(workspaceId).all<Row>(),
  ]);
  const stored = new Map(rows.results.map(row => [row.switch_key, row]));
  const metadata = (key: SwitchKey) => {
    const row = stored.get(key);
    return {changedBy: row?.changed_by_member_id ? {id: row.changed_by_member_id, displayName: row.display_name ?? 'Removed member'} : null, changedAt: row?.changed_at ?? null};
  };
  const configured = providerConfigured(config);
  const ai = !!workspace?.ai_enabled;
  const states: SwitchState[] = [{key: 'ai', label: 'AI', enabled: ai, available: configured, effective: ai && configured, prerequisites: configured ? [] : ['Configure an AI provider and model first.'], ...metadata('ai')}];
  for (const key of featureKeys) {
    const definition = featureCatalogue[key], prerequisites: string[] = [];
    if (key === 'ask') {
      if (!configured) prerequisites.push('Configure an AI provider and model first.');
      if (!ai) prerequisites.push('Turn AI on first.');
    }
    if (definition.prerequisite && !states.find(state => state.key === definition.prerequisite)?.effective) prerequisites.push('Turn Ask on first.');
    if (definition.hold) prerequisites.push(definition.hold);
    const enabled = !!stored.get(key)?.enabled;
    states.push({key, label: definition.label, enabled, available: prerequisites.length === 0, effective: enabled && prerequisites.length === 0, prerequisites, ...metadata(key)});
  }
  return states;
}

/** Member shell projection deliberately omits owner audit metadata. */
export async function featureAvailability(db: D1Database, workspaceId: string, config: RuntimeBindings): Promise<Record<FeatureKey, boolean>> {
  const states = await switchStates(db, workspaceId, config);
  return Object.fromEntries(featureKeys.map(key => [key, states.find(state => state.key === key)!.effective])) as Record<FeatureKey, boolean>;
}
