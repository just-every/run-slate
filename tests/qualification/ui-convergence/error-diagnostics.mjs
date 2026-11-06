/** Preserve only stable, nonsecret guard diagnostics beside the original response. */
export function apiErrorDiagnostics(body) {
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return {}; }
  }
  const details = body?.details;
  if (!details || typeof details !== 'object') return {};
  const diagnostic = {};
  if (['page_revision', 'revision_tuple', 'acl_epoch', 'membership'].includes(details.guard)) diagnostic.guard = details.guard;
  const compared = {};
  for (const field of ['expected', 'current']) {
    const value = details.compared?.[field];
    if (typeof value === 'number' && Number.isFinite(value)) compared[field] = value;
  }
  if (Object.keys(compared).length) diagnostic.compared = compared;
  return diagnostic;
}
