import {z} from 'zod';
import {evidenceSchema} from '../ai/contracts';
export const ambientScopeSchema=z.object({operationKey:z.string(),pageId:z.string(),objective:z.string().min(1).max(8000),refs:z.array(evidenceSchema).min(1).max(100),audience:z.array(z.string()).min(1).max(100),sweepSeconds:z.number().int().min(60).max(604800).default(86400),auditPercent:z.number().int().min(0).max(100).default(10),threshold:z.number().min(0).max(1).default(0.7)}).strict();
export {ambientAssessmentSchema} from '../ai/ambient-assessment';
export interface AmbientScope {id:string;workspace_id:string;owner_id:string;page_id:string;revision_id:string;refs_json:string;audience_json:string;objective:string;state:'active'|'blocked'|'stopped';sweep_seconds:number;audit_percent:number;threshold:number;next_sweep_at:string;reason:string|null}
export interface AmbientEvent {id:string;scope_id:string;workspace_id:string;event_key:string;kind:'change'|'frontier-sweep'|'low-score-audit'|'shadow';refs_json:string;run_id:string|null;comparison_event_id:string|null;state:string;assessment_json:string|null;failure_reason:string|null}
