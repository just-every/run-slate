export function askDraftKey(workspaceId: string, memberId: string, pageId: string) {
  return `slate:ask-draft:${workspaceId}:${memberId}:${pageId}`;
}
export function readAskDraft(storage: Pick<Storage, "getItem">, key: string): string {
  return storage.getItem(key) ?? "";
}
export function saveAskDraft(storage: Pick<Storage, "setItem" | "removeItem">, key: string, question: string) {
  if (question) storage.setItem(key, question);
  else storage.removeItem(key);
}
