import { z } from 'zod';
import { evidenceSchema } from '../ai/contracts';
export const skillDefinitionSchema=z.object({instructions:z.string().min(1),refs:z.array(evidenceSchema).min(1),audience:z.array(z.string()).min(1),tools:z.array(z.enum(['read-evidence','calculate','propose','granted-effect'])),effects:z.array(z.string()),preconditions:z.array(z.string()),successTests:z.array(z.string()).min(1),escalations:z.array(z.string()),maxCostMicros:z.number().int().positive()}).strict();
export type SkillDefinition=z.infer<typeof skillDefinitionSchema>;
