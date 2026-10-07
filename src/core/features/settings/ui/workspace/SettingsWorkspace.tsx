import { useFlagshipEnabled } from "../../../../app/ui/LaunchProfile";
import { ChatNotifications } from "./ChatNotifications";
import { ContainerWorkspace } from "../../../containers/ui/workspace/ContainerWorkspace";
import { StatusSettings } from "../../../page-status/ui/workspace/StatusSettings";
import { AutomationWorkspace } from "../../../automation/ui/workspace/AutomationWorkspace";
import { ActivityWorkspace } from "../../../activity/ui/workspace/ActivityWorkspace";
import { PersonalPreferences } from "../../../navigation/ui/workspace/PersonalPreferences";
import { useEffect, useState } from "react";
import { ConnectionsPanel } from "../../../connectors/ui/workspace/ConnectionsPanel";
import { WorkspacePreferences } from "./WorkspacePreferences";
import { AppearancePanel } from "./AppearancePanel";
import { PortabilityPanel } from "./PortabilityPanel";
import { MembersPanel } from "./MembersPanel";
const sections = [
  ["workspace", "Workspace"],
  ["members", "People"],
  ["appearance", "Appearance"],
  ["preferences", "Preferences"],
  ["activity", "Activity"],
  ["automation", "Automations"],
  ["statuses", "Statuses"],
  ["spaces", "Spaces"],
  ["chat", "Chat notifications"],
  ["connections", "Connections"],
  ["portability", "Import & export"],
] as const;
export function SettingsWorkspace() {
  const flagship = useFlagshipEnabled();
  const [section, setSection] = useState(() =>
    typeof window === "undefined"
      ? "workspace"
      : (new URLSearchParams(window.location.search).get("section") ??
        "workspace"),
  );
  useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("section");if(requested&&sections.some(([id])=>id===requested))setSection(requested);},[]);
  return (
    <>
      <header className="topbar">
        <span>Settings</span>
        <a href="/app">Back to workspace</a>
      </header>
      <section className="main settings-workspace"><h1 className="sr-only">Settings</h1>
        <nav className="settings-tabs" aria-label="Settings sections">
          {sections.filter(([id]) => flagship || id !== "connections").map(([id, label]) => (
            <button
              key={id}
              aria-current={section === id ? "page" : undefined}
              onClick={() => {
                setSection(id);
                history.replaceState(null, "", `?section=${id}`);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {section === "chat" ? (
          <ChatNotifications />
        ) : section === "spaces" ? (
          <ContainerWorkspace />
        ) : section === "statuses" ? (
          <StatusSettings />
        ) : section === "automation" ? (
          <AutomationWorkspace />
        ) : section === "activity" ? (
          <ActivityWorkspace />
        ) : section === "preferences" ? (
          <PersonalPreferences />
        ) : section === "members" ? (
          <MembersPanel />
        ) : section === "appearance" ? (
          <AppearancePanel />
        ) : section === "connections" ? (
          flagship ? <ConnectionsPanel /> : <p role="status">Connections are unavailable in the core-wiki profile.</p>
        ) : section === "portability" ? (
          <PortabilityPanel />
        ) : (
          <WorkspacePreferences />
        )}
      </section>
    </>
  );
}
