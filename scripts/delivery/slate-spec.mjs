/** Slate's content archive covers canonical D1 content and reconstructible collaboration state. */
export function withSlateExport(spec) {
  return { ...spec, nativeExport: { path: '/app/export', covers: ['DB', 'CONTENT_COLLABORATION'] } };
}
