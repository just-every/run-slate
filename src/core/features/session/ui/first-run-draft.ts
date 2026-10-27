// The first-run answers, kept in this tab's session storage so a reload of /setup does not lose them. Storage is a per-viewer
// convenience: when it is unavailable the page simply starts blank, as it always did.
const key = "slate-first-run-draft";

export interface FirstRunDraft { displayName?: string; workspaceName: string; containerName: string; pageTitle: string; addresses: string }

export function readDraft(): FirstRunDraft | null {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object") return null;
    const { workspaceName, containerName, pageTitle, addresses } = parsed as Record<string, unknown>;
    return [workspaceName, containerName, pageTitle, addresses].every((value) => typeof value === "string")
      ? (parsed as FirstRunDraft)
      : null;
  } catch {
    return null;
  }
}

export function writeDraft(draft: FirstRunDraft) {
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage is unavailable: the answers just are not kept across a reload.
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing was stored.
  }
}
