import type { Context } from 'hono';
import type { AppEnvironment, AuthenticatedMember } from './types';
import { ApiProblem } from './problems';
export interface FeatureContext { db: D1Database; files: R2Bucket; jobs: Queue<unknown>; actor: AuthenticatedMember; now: string; authorizationEpoch?: number; sourceSecret?: string }
export function featureContext(context: Context<AppEnvironment>): FeatureContext {
  const actor = context.get('member');
  if (!actor) throw new ApiProblem(401, 'UNAUTHENTICATED', 'A valid session is required.');
  return { db: context.env.DB, files: context.env.FILES, jobs: context.env.JOBS, actor, now: new Date().toISOString(), sourceSecret: context.env.CONNECTOR_CREDENTIALS_KEY };
}
