/** Insert one semantic newline, independent of browser-generated BR/DIV fillers. */
export function insertEditableLineBreak(root: HTMLElement): void {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const newline = root.ownerDocument.createTextNode("\n");
  range.insertNode(newline);
  range.setStartAfter(newline);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
