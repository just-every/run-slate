/** Credential material is never part of a company agent's record surface.
 * Wiki prose remains untrusted; these replacements do not make it instructions. */
const secretField=(name:string)=>/^(?:password|secret|apikey|accesstoken|refreshtoken|privatekey|tokenhash|credentialciphertext|credentialsecret)$/i.test(name.replace(/[^a-z0-9]/gi,''));
export function recordOutput(value:unknown):unknown {
 if(typeof value==='string')return value
  .replace(/\bBearer[ \t]+[^\s<>"']+/gi,'Bearer [redacted]')
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|slate_[a-f0-9]{64})\b/gi,'[redacted credential]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted signed credential]')
  .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,'[redacted private key]');
 if(Array.isArray(value))return value.map(recordOutput);
 if(value&&typeof value==='object'){
  const source=value as Record<string,unknown>;
  const fields=Array.isArray(source.fields)?source.fields as Array<{id?:unknown;name?:unknown}>:[];
  const hidden=new Set(fields.filter(field=>typeof field.name==='string'&&secretField(field.name)).map(field=>field.id));
  const values=(item:unknown)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).map(([key,data])=>[key,hidden.has(key)?'[redacted credential]':recordOutput(data)])):recordOutput(item);
  return Object.fromEntries(Object.entries(source).map(([key,item])=>[key,secretField(key)?'[redacted credential]':hidden.size&&key==='values'?values(item):hidden.size&&key==='records'&&Array.isArray(item)?item.map(row=>row&&typeof row==='object'?recordOutput({...row,values:values(row.values)}):recordOutput(row)):recordOutput(item)]));
 }
 return value;
}
