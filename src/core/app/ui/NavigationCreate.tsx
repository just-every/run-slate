import { useEffect, useId, useRef, useState } from "react";
import { Database, FileText, FolderPlus, LayoutTemplate, Plus } from "lucide-react";

/**
 * `pageDestination` names the space Page creates in before the click: a space name, null when a
 * space must be named first, or undefined while the spaces are still loading.
 */
export function NavigationCreate({ onPage, onDatabase, pageDestination, pending = false }: { onPage: () => void; onDatabase: () => void; pageDestination?: string | null; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const hint = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>("button, a")?.focus();
  }, [open]);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <div className="navigation-create" onKeyDown={event => {
    if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = [...(menu.current?.querySelectorAll<HTMLElement>("button, a") ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={trigger} className="primary-button" aria-busy={pending || undefined} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}><Plus aria-hidden="true" />Create</button>
    {open ? <nav className="create-menu" ref={menu} aria-label="Create content" role="menu">
      <button role="menuitem" aria-label="Page" aria-describedby={pageDestination === undefined ? undefined : hint} disabled={pending} onClick={() => { close(); onPage(); }}><FileText aria-hidden="true" />Page{pageDestination === undefined ? null : <span id={hint} className="create-menu-hint">{pageDestination === null ? "in a new space" : `in ${pageDestination}`}</span>}</button>
      <button role="menuitem" onClick={() => { close(); onDatabase(); }}><Database aria-hidden="true" />Database</button>
      <a role="menuitem" href="/app/containers?create=true"><FolderPlus aria-hidden="true" />Space</a>
      <a role="menuitem" href="/app/templates"><LayoutTemplate aria-hidden="true" />Page from template</a>
    </nav> : null}
  </div>;
}
