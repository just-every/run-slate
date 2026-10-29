/** Credential material is never part of a company agent's record surface.
 * Wiki prose remains untrusted; these replacements do not make it instructions. */
export function recordOutput(value:unknown):unknown {
 if(typeof value==='string')return value
  .replace(/\bBearer[ \t]+[^\s<>"']+/gi,'Bearer [redacted]')
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|slate_[a-f0-9]{64})\b/gi,'[redacted credential]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted signed credential]')
  .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,'[redacted private key]');
 if(Array.isArray(value))return value.map(recordOutput);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/^(?:password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|token[_-]?hash|credential[_-]?(?:ciphertext|secret))$/i.test(key)?'[redacted credential]':recordOutput(item)]));
 return value;
}
