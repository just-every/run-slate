import type {FeatureContext} from '../../app/feature-context';
/** Credential material is never part of a company agent's record surface.
 * Wiki prose remains untrusted; these replacements do not make it instructions. */
const secretField=(name:string)=>/^(?:password|secret|token|apikey|apitoken|accesstoken|refreshtoken|privatekey|tokenhash|credential|credentialciphertext|credentialsecret|clientsecret|webhooksecret|signingkey|webhooksigningkey|authorization)$/i.test(name.replace(/[^a-z0-9]/gi,''));
export function recordOutput(value:unknown,known:ReadonlySet<string>=new Set()):unknown {
 if(typeof value==='string')return value
  .replace(/\bBearer[ \t]+[^\s<>"']+/gi,'Bearer [redacted]')
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|slate_[a-f0-9]{64})\b/gi,'[redacted credential]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted signed credential]')
  .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,'[redacted private key]');
 if(Array.isArray(value))return value.map(item=>recordOutput(item,known));
 if(value&&typeof value==='object'){
  const source=value as Record<string,unknown>;
  const fields=Array.isArray(source.fields)?source.fields as Array<{id?:unknown;name?:unknown}>:[];
  const hidden=new Set([...known,...fields.filter(field=>typeof field.name==='string'&&secretField(field.name)).map(field=>String(field.id))]);
  return Object.fromEntries(Object.entries(source).map(([key,item])=>[key,secretField(key)||hidden.has(key)?'[redacted credential]':recordOutput(item,hidden)]));
 }
 return value;
}

/** Record pages and mutation receipts can carry values without field labels.
 * Resolve labels internally so every representation keeps the same redaction. */
export async function nativeRecordOutput(value:unknown,ctx:Pick<FeatureContext,'db'|'actor'>):Promise<unknown> {
 const fields=await ctx.db.prepare('SELECT f.id,f.name FROM database_fields f JOIN databases d ON d.id=f.database_id WHERE d.workspace_id=?').bind(ctx.actor.workspaceId).all<{id:string;name:string}>();
 const hidden=new Set(fields.results.filter(field=>secretField(field.name)).map(field=>field.id));
 return recordOutput(value,hidden);
}
