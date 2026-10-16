import { ApiProblem } from './problems';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  if(value===undefined || (typeof value==='number'&&!Number.isFinite(value)) || typeof value==='function' || typeof value==='symbol' || typeof value==='bigint') throw new ApiProblem(400,'INVALID_REQUEST','Operation inputs must be JSON values.');
  return JSON.stringify(value);
}
export async function requestHash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
}
