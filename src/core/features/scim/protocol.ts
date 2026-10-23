import type { Context } from 'hono';
import { ApiProblem } from '../../app/problems';
import type { AppEnvironment } from '../../app/types';
import { ZodError } from 'zod';
export const SCIM = 'application/scim+json';
export const URN = 'urn:ietf:params:scim:';
export const USER = `${URN}schemas:core:2.0:User`;
export const GROUP = `${URN}schemas:core:2.0:Group`;
export const PATCH = `${URN}api:messages:2.0:PatchOp`;
export const IGNORED = 'urn:slate:params:scim:schemas:extension:2.0:Provisioning';
export class ScimError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 503, message: string, public scimType?: string) { super(message); }
}
export function scimError(c: Context<AppEnvironment>, cause: unknown): Response {
  const known = cause instanceof ScimError || cause instanceof ApiProblem;
  const invalid = cause instanceof ZodError || cause instanceof SyntaxError;
  const status = known ? cause.status : invalid ? 400 : 500;
  const scimType = cause instanceof ScimError ? cause.scimType : cause instanceof ApiProblem ? ({ENTITY_CONFLICT:'uniqueness',REVISION_CONFLICT:'mutability',OPERATION_KEY_CONFLICT:'invalidValue'} as Record<string,string>)[cause.code] : invalid ? 'invalidSyntax' : undefined;
  if (status === 401) c.header('WWW-Authenticate', 'Bearer realm="Slate SCIM"');
  return scimJson(c, { schemas: [`${URN}api:messages:2.0:Error`], status: String(status), detail: known ? cause.message : invalid ? 'The SCIM request is invalid.' : 'Slate could not complete the SCIM request.', ...(scimType ? { scimType } : {}) }, status);
}
export function scimJson(c: Context<AppEnvironment>, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { ...Object.fromEntries(new Headers(c.res.headers)), 'content-type': `${SCIM}; charset=utf-8`, 'cache-control': 'no-store' } });
}
export async function scimBody(c: Context<AppEnvironment>): Promise<Record<string, unknown>> {
  if (!(c.req.header('content-type') ?? '').split(';')[0]!.trim().match(/^application\/(scim\+)?json$/i)) throw new ScimError(415, 'Use application/scim+json.');
  const value: unknown = await c.req.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ScimError(400, 'A SCIM object is required.', 'invalidSyntax');
  return value as Record<string, unknown>;
}
export function listResponse<T>(resources: T[], totalResults = resources.length, startIndex = 1) {
  return { schemas: [`${URN}api:messages:2.0:ListResponse`], totalResults, startIndex, itemsPerPage: resources.length, Resources: resources };
}
export function pagination(query: Record<string,string>) {
  const parse = (key: string, fallback: number) => {
    if (query[key] === undefined) return fallback;
    if (!/^\d+$/.test(query[key]!)) throw new ScimError(400, 'Pagination must use nonnegative integers.', 'invalidValue');
    const value = Number(query[key]);
    if (!Number.isSafeInteger(value)) throw new ScimError(400, 'Pagination is out of range.', 'invalidValue');
    return value;
  };
  return { startIndex: Math.max(1, parse('startIndex', 1)), count: Math.min(200, parse('count', 100)) };
}
export function equalityFilter(filter: string | undefined, attribute: string): string | undefined {
  if (!filter) return undefined;
  const match = new RegExp(`^\\s*${attribute}\\s+eq\\s+("(?:[^"\\\\]|\\\\.)*")\\s*$`, 'i').exec(filter);
  if (!match) throw new ScimError(400, `Only ${attribute} eq filters are supported.`, 'invalidFilter');
  try { return JSON.parse(match[1]!) as string; } catch { throw new ScimError(400, 'Invalid filter string.', 'invalidFilter'); }
}
export function ignoredAttributes(body: Record<string,unknown>, supported: string[]): string[] {
  return Object.keys(body).filter(key => !['schemas','id','meta',...supported].some(known => known.toLowerCase() === key.toLowerCase()));
}
export function reportIgnored<T extends Record<string,unknown>>(value: T, ignored: string[]): T & Record<string,unknown> {
  return ignored.length ? { ...value, schemas: [...(value.schemas as string[]), IGNORED], [IGNORED]: { ignoredAttributes: [...new Set(ignored)] } } : value;
}
