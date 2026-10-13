import assert from 'node:assert/strict';
import test from 'node:test';
import { askDraftKey, readAskDraft, saveAskDraft } from '../../../src/core/features/pages/ui/workspace/askDraft';

test('Ask drafts survive remounts, are scoped to workspace/member/page and clear when erased', () => {
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
  const key = askDraftKey('workspace-a', 'member-a', 'page-a');
  saveAskDraft(storage, key, 'An unfinished question');
  assert.equal(readAskDraft(storage, askDraftKey('workspace-a', 'member-a', 'page-a')), 'An unfinished question');
  for (const other of [askDraftKey('workspace-b', 'member-a', 'page-a'), askDraftKey('workspace-a', 'member-b', 'page-a'), askDraftKey('workspace-a', 'member-a', 'page-b')]) {
    assert.notEqual(other, key);
    assert.equal(readAskDraft(storage, other), '');
  }
  saveAskDraft(storage, key, '');
  assert.equal(readAskDraft(storage, key), '');
  assert.equal(entries.size, 0);
});
