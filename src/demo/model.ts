import type { EvidencePacket } from '../core/features/ai/contracts';
import type { ModelResult } from '../core/features/ai/provider';

/** A grounded, provider-shaped response used only by demoEffect. */
export function demoModelAnswer(packet: EvidencePacket[]): ModelResult {
  const evidence = packet[0];
  const text = evidence ? evidence.text.slice(0, 900) : 'The team keeps its current work and decisions in this handbook.';
  return {
    answer: { statements: [{ text, evidenceIds: evidence ? [evidence.id] : [], kind: 'observation', limitations: [] }], unresolved: [], proposedChanges: [], researchPlan: null, hypothesisAssessment: null },
    tokens: 0, costMicros: 0, providerReceipt: 'demo-model-success',
  };
}
