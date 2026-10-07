import { isPlaceholderBreak } from "./readRichText";
/** DOM text offsets survive React replacing a marked run's text node. */
export interface EditableSelection { anchor: number; focus: number }
export function readEditableSelection(root: HTMLElement): EditableSelection | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const offset = (target: Node, position: number) => {
    let total = 0;
    let found = false;
    const visit = (node: Node) => {
      if (found) return;
      if (node.nodeType === Node.ELEMENT_NODE && node !== root) {
        const element = node as HTMLElement;
        if ((element.tagName === "DIV" || element.tagName === "P") && element.previousSibling) total++;
        if (element.tagName === "BR") { if (!isPlaceholderBreak(element, root)) total++; return; }
      }
      if (node === target) {
        if (node.nodeType === Node.TEXT_NODE) total += position;
        else Array.from(node.childNodes).slice(0, position).forEach(visit);
        found = true;
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) total += node.textContent?.length ?? 0;
      else node.childNodes.forEach(visit);
    };
    visit(root);
    return total;
  };
  return { anchor: offset(selection.anchorNode, selection.anchorOffset), focus: offset(selection.focusNode, selection.focusOffset) };
}
export function restoreEditableSelection(root: HTMLElement, value: EditableSelection): void {
  if (root.ownerDocument.activeElement !== root) return;
  const locate = (offset: number): [Node, number] => {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    let last: Node = root;
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length ?? 0;
      if (offset <= length) return [node, offset];
      offset -= length;
      last = node;
    }
    return [last, last === root ? root.childNodes.length : last.textContent?.length ?? 0];
  };
  root.ownerDocument.getSelection()?.setBaseAndExtent(...locate(value.anchor), ...locate(value.focus));
}
