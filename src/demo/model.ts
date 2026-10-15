import type { EvidencePacket } from '../core/features/ai/contracts';
import type { ModelResult } from '../core/features/ai/provider';

/** A grounded, provider-shaped response used only by demoEffect. */
export function demoModelAnswer(packet: EvidencePacket[]): ModelResult {
  const evidence = packet[0];
  const text = evidence ? readableEvidence(evidence.text).slice(0, 900) : 'The team keeps its current work and decisions in this handbook.';
  return {
    answer: { statements: [{ text, evidenceIds: evidence ? [evidence.id] : [], kind: 'observation', limitations: [] }], unresolved: [], proposedChanges: [], researchPlan: null, hypothesisAssessment: null },
    tokens: 0, costMicros: 0, providerReceipt: 'demo-model-success',
  };
}

function readableEvidence(text: string): string {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return text; }
  if (!value || typeof value !== 'object' || !('body' in value)) return text;
  const parts: string[] = [];
  function collect(node: unknown) {
    if (Array.isArray(node)) { for (const child of node) collect(child); return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (key === 'text' && typeof child === 'string') parts.push(child);
      else if (typeof child === 'object') collect(child);
    }
  }
  collect(value.body);
  return parts.join(' ').trim();
}
