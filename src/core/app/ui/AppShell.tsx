import { LaunchProfileProvider } from "./LaunchProfile";
import {AccessRequestHandler} from "../../features/sharing/ui/AccessRequestHandler";
import {RoutedSearchHighlight} from "../../features/search/ui/workspace/SearchHighlight";
import { KeyboardReference } from "./KeyboardReference";
import { PublicDuplicate } from "./PublicDuplicate";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import type { WorkspaceSnapshot } from "./workspaceSnapshot";
import { AppNavigation } from "./AppNavigation";
import { WorkspaceGate } from "./WorkspaceGate";
import { WorkspaceProvider } from "./WorkspaceContext";
import "./folio.generated.css";
import { useAppearance } from "../../client/useAppearance";

export function AppShell({
  snapshot,
  children,
}: {
  snapshot: WorkspaceSnapshot;
  children: ReactNode;
}) {
  const { member } = snapshot;
  useAppearance();
  const [shortcuts, setShortcuts] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        window.location.assign("/app/search");
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setShortcuts(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  return (
    <LaunchProfileProvider initial={snapshot.profile}><WorkspaceProvider snapshot={snapshot}>
      <WorkspaceGate>
        <div className="slate-app">
          <PublicDuplicate />
          {shortcuts ? (
            <KeyboardReference onClose={() => setShortcuts(false)} />
          ) : null}
          <a className="skip-link" href="#workspace-content" onClick={event=>{
            const content=window.document.getElementById("workspace-content");
            if(!content)return;
            event.preventDefault();
            window.history.replaceState(window.history.state, "", "#workspace-content");
            content.focus();
            content.scrollIntoView({block:"start"});
          }}>
            Skip to content
          </a>
          <div className="mobile-bar">
            <button
              type="button"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
            <span>{member.workspaceName}</span>
          </div>
          <div className="app" data-navigation-open={open}>
            <AppNavigation onNavigate={() => setOpen(false)} />
            <main className="center" id="workspace-content" tabIndex={-1}>
              <AccessRequestHandler /><RoutedSearchHighlight />
              {children}
            </main>
          </div>
        </div>
      </WorkspaceGate>
    </WorkspaceProvider></LaunchProfileProvider>
  );
}
