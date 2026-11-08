import type { JsonValue } from '../shared/api/common';

export type GuardDiagnostic = { guard: 'membership' | 'revision_tuple' } | { guard: 'acl_epoch'; expected: number };
const prefix = 'core_write_guards:v1:';
const suffix = ':end_guard';

/** CASE evaluates this only on rejection. SQLite echoes an invalid JSON path in
 * its error, so the diagnostic comes from the aborting statement, not a later
 * read after rollback. Never put content, SQL or arbitrary bindings in it. */
export function guardFailure(diagnostic: GuardDiagnostic) {
  const compared = diagnostic.guard === 'acl_epoch'
    ? ", 'compared', json_object('expected', ?, 'current', (SELECT epoch FROM core_acl_epoch WHERE id=1))"
    : '';
  return {
    sql: `json_extract('{}', '${prefix}' || json_object('guard', ?${compared}) || '${suffix}')`,
    values: [diagnostic.guard, ...(diagnostic.guard === 'acl_epoch' ? [diagnostic.expected] : [])],
  };
}

export function rejectedGuard(cause: unknown): JsonValue | undefined {
  const message = String(cause), start = message.indexOf(prefix);
  if (start < 0) return;
  const end = message.indexOf(suffix, start + prefix.length);
  if (end < 0 || end - start > 256) return;
  let diagnostic;
  try { diagnostic = JSON.parse(message.slice(start + prefix.length, end)); }
  catch { return; }
  if (!diagnostic || typeof diagnostic !== 'object') return;
  if (diagnostic.guard === 'membership' || diagnostic.guard === 'revision_tuple') return { guard: diagnostic.guard };
  if (diagnostic.guard === 'acl_epoch' && Number.isSafeInteger(diagnostic.compared?.expected)
    && (diagnostic.compared.current === null || Number.isSafeInteger(diagnostic.compared.current))) {
    return { guard: diagnostic.guard, compared: { expected: diagnostic.compared.expected, current: diagnostic.compared.current } };
  }
}
