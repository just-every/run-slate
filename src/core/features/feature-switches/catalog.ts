export const featureKeys = ['ask', 'suggestions', 'agents', 'connectors', 'mcp', 'chat-ask'] as const;
export type FeatureKey = typeof featureKeys[number];
export type SwitchKey = FeatureKey | 'ai';

/** Safety holds are release decisions, never an owner-overridable permission. */
export const featureCatalogue: Record<FeatureKey, {label: string; prerequisite?: FeatureKey; hold?: string}> = {
  ask: {label: 'Ask, AI writing and AI fields', hold: 'Safety acceptance pending for answers.'},
  suggestions: {label: 'Suggestions', prerequisite: 'ask'},
  agents: {label: 'Agent maintenance', prerequisite: 'ask'},
  connectors: {label: 'Connectors', hold: 'Safety acceptance pending for connected items.'},
  mcp: {label: 'MCP'},
  'chat-ask': {label: 'Chat ask and unfurl', hold: 'Not available. Installable chat ask and unfurl are not yet available.'},
};

export interface SwitchState {
  key: SwitchKey;
  label: string;
  enabled: boolean;
  available: boolean;
  effective: boolean;
  prerequisites: string[];
  changedBy: {id: string; displayName: string} | null;
  changedAt: string | null;
}
export interface FeatureProfile {
  profile: 'core-wiki' | 'flagship';
  features?: Partial<Record<FeatureKey, boolean>>;
}
