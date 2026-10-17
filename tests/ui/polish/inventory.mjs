import assert from 'node:assert/strict';

const captures = new Map();
const common = [
  'spaces-nav', 'space', ...['content','blog','settings','templates','trash','bulk'].map(tab => `space-${tab}`),
  'settings', 'settings-portability', 'settings-portability-expanded', 'settings-preferences', 'settings-edit-rows',
  'nav-open', 'nav-create', 'nav-owner', ...['light','dark'].flatMap(theme => [`search-${theme}`, `search-${theme}-cleared`]),
  'addblock-viewport', 'editor-block-actions', 'editor-alignment', 'addblock-lower-edge', 'addblock-empty-caret',
  'more-menu', 'more-dialog-icon', 'more-panel-display', 'more-panel-readership', 'more-menu-watched',
  'share-panel', 'share-panel-expanded', 'share-panel-removal', 'ai-allowance', 'ai-allowance-collapsed',
  'comments-resolve', 'comments-resolved', 'comments-resolved-reloaded', 'comments-offline', 'comments-retry',
];
export function recordCapture(width, name, sweep) {
  const rows = captures.get(width) ?? new Map();
  assert.ok(!rows.has(name), `${width}px ${name}: capture name is unique`);
  rows.set(name, { name, candidates: sweep.candidates, checked: sweep.checked, disabledChecked: sweep.records.filter(r => !r.excluded && r.disabled).length, findings: sweep.findings });
  captures.set(width, rows);
  return [...captures].map(([width, rows]) => ({ width, captures: [...rows.values()] }));
}
export function assertCaptureInventory(width) {
  const expected = [...common, width === 1440 ? 'nav-collapsed' : 'nav-closed'].sort();
  assert.deepEqual([...(captures.get(width)?.keys() ?? [])].sort(), expected, `${width}px: complete captured-screen inventory`);
}
