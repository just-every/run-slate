import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SlateMark } from "../../ui/brand/SlateMark";
import { IconAction } from "./header/IconAction";

/**
 * The sidebar's header row: the workspace's mark and name, and beside them the icon button that collapses the rail. A collapsed
 * rail keeps the mark and shows the same button as "Expand sidebar", so the way back is as plain as the way in.
 */
export function SidebarHeader({ name, mark, collapsed, onToggle }: { name: string; mark: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="sidebar-header">
      <Link className="brand" to="/app" activeOptions={{ exact: true }} activeProps={{ className: "" }} data-testid="nav-workspace">
        <span className="brand-mark" aria-hidden="true">
          <SlateMark />
        </span>
        {mark ? <span className="workspace-mark" data-testid="workspace-mark" aria-hidden="true">{mark}</span> : null}
        <span className="brand-name" data-rer-name data-testid="workspace-name">{name}</span>
      </Link>
      <IconAction className="sidebar-toggle" label={collapsed ? "Expand sidebar" : "Collapse sidebar"} tooltipAlign={collapsed ? "right" : "end"} onClick={onToggle}>
        {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
      </IconAction>
    </div>
  );
}
