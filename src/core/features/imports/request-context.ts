import {importDatabaseBudget,type ImportBatchStatement} from './request-budget';
import type {Context} from 'hono';
import type {AppEnvironment} from '../../app/types';
import {featureContext,type FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {readCookie,SESSION_COOKIE_NAME} from '../../platform/auth/cookie';
import {sessionDigest} from '../../platform/auth/token';

export type ImportPreviewTimings=Partial<Record<'archiveReadAdmissionMs'|'sourceParseMs'|'nativePlanningMs'|'sourceCustodyWriteMs'|'kitReviewPreviewMs'|'fullPreviewMs',number>>;
export interface ImportRequestContext extends FeatureContext {nativeSessionId:string;sqlMetrics:ReturnType<typeof importDatabaseBudget>['metrics'];previewTimings?:ImportPreviewTimings;rejectedImportBatch?:(error:unknown,statements:ImportBatchStatement[])=>Promise<void>}
/** Reuse the active native session protocol without retaining its capability. */
export async function importRequestContext(c:Context<AppEnvironment>):Promise<ImportRequestContext> {
  const ctx=featureContext(c),cookie=readCookie(c.req.raw.headers,SESSION_COOKIE_NAME);
  if(!cookie)throw new ApiProblem(401,'UNAUTHENTICATED','A valid session is required.');
  const digest=await sessionDigest(c.get('runtimeConfig').sessionSecret,cookie);
  const session=await ctx.db.prepare("SELECT id FROM sessions WHERE token_digest=? AND member_id=? AND revoked_at IS NULL AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(digest,ctx.actor.id).first<{id:string}>();
  if(!session)throw new ApiProblem(401,'UNAUTHENTICATED','A valid session is required.');
  const budget=importDatabaseBudget(ctx.db,(error,statements)=>request.rejectedImportBatch?.(error,statements)??Promise.resolve());
  const request:ImportRequestContext={...ctx,db:budget.database,nativeSessionId:session.id,sqlMetrics:budget.metrics};
  return request;
}
