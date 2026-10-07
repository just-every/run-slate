import type { PageRef } from './content';
import type { JsonValue } from './common';
export interface InquiryView { pageRef: PageRef; question: string; hypotheses: JsonValue[]; interimFinding: JsonValue | null; analyses: JsonValue[]; trial?: JsonValue; outcomes: JsonValue[]; methodRevision: string; unresolved: string[] }
export type { EvidenceRef, RunView, EffectView } from './work';
