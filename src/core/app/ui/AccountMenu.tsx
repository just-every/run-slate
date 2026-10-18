import { personInitials } from '../../shared/person-identity';
import { Archive, ChevronRight, Database, LayoutTemplate, Settings } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "./WorkspaceContext";

/** The account button at the foot of the sidebar; its tools open upward so they never fall below the rail. */
export function AccountMenu({ onNewDatabase }: { onNewDatabase?: () => void }) {
  const { member } = useWorkspace();
  const [open, setOpen] = useState(false);
  return (
    <div className="workspace">
      {open ? (
        <nav aria-label="Workspace tools">
          {onNewDatabase ? <button className="navlink" onClick={onNewDatabase}>
            <Database aria-hidden="true" />
            New database
          </button> : null}
          <a className="navlink" href="/app/templates">
            <LayoutTemplate aria-hidden="true" />
            Templates
          </a>
          <a className="navlink" href="/app/archive">
            <Archive aria-hidden="true" />
            Archive & trash
          </a>
          <a className="navlink" href="/app/settings">
            <Settings aria-hidden="true" />
            Settings
          </a>
        </nav>
      ) : null}
      <button className="workrow" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span data-testid="member-initials" className="member-initials">
          {personInitials(member.displayName, member.email)}
        </span>
        <span data-testid="member-name">{member.displayName}</span>
        <ChevronRight aria-hidden="true" className="workrow-chevron" />
      </button>
    </div>
  );
}
