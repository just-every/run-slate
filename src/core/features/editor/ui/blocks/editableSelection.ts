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
        const mentionLength = element.getAttribute("data-slate-mention-length");
        if (mentionLength !== null) {
          // A mention is one immutable run. Its rendered prefix and status are
          // presentation, while slicing and formatting use its stored text.
          if (element.contains(target)) {
            total += position > 0 ? Number(mentionLength) : 0;
            found = true;
          } else total += Number(mentionLength);
          return;
        }
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
    let point: [Node, number] | undefined;
    const boundary = (node: Node, after: boolean): [Node, number] =>
      [node.parentNode!, Array.from(node.parentNode!.childNodes).indexOf(node as ChildNode) + Number(after)];
    const visit = (node: Node) => {
      if (point) return;
      if (node.nodeType === Node.ELEMENT_NODE && node !== root) {
        const element = node as HTMLElement;
        const mentionLength = element.getAttribute("data-slate-mention-length");
        if (mentionLength !== null) {
          const length = Number(mentionLength);
          // Never put a caret inside contenteditable=false: Chromium accepts
          // focus there but drops subsequent typing.
          if (offset <= length) point = boundary(node, offset > 0);
          else offset -= length;
          return;
        }
        if ((element.tagName === "DIV" || element.tagName === "P") && element.previousSibling) {
          if (offset === 0) { point = boundary(node, false); return; }
          offset--;
        }
        if (element.tagName === "BR") {
          const length = isPlaceholderBreak(element, root) ? 0 : 1;
          if (offset <= length) point = boundary(node, offset > 0);
          else offset -= length;
          return;
        }
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent?.length ?? 0;
        if (offset <= length) point = [node, offset];
        else offset -= length;
      } else node.childNodes.forEach(visit);
    };
    visit(root);
    return point ?? [root, root.childNodes.length];
  };
  root.ownerDocument.getSelection()?.setBaseAndExtent(...locate(value.anchor), ...locate(value.focus));
}
