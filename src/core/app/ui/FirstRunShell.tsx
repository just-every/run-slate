import { Link } from "@tanstack/react-router";
import { FirstRunPage } from "../../features/session/ui/FirstRunPage";
import { useWorkspace } from "./WorkspaceContext";
import "./first-run-shell.css";

/** Setup keeps its own gate: no content actions are mounted until it completes. */
export function FirstRunShell() {
  const { member, workspace } = useWorkspace();
  return <div className="slate-app first-run-shell">
    <header className="topbar">
      <Link to="/" activeProps={{ className: "" }}>Slate</Link>
      <Link to="/app" activeOptions={{ exact: true }} activeProps={{ className: "" }} data-testid="nav-workspace"><span data-testid="workspace-name">{workspace.data?.name}</span></Link>
      <span data-testid="member-name">{member.displayName}</span>
    </header>
    <section aria-label="Set up your workspace" data-testid="workspace-empty-state">
      <FirstRunPage />
    </section>
  </div>;
}
