import { useFlagshipEnabled } from "../../../../app/ui/LaunchProfile";
import { ChatNotifications } from "./ChatNotifications";
import { ContainerWorkspace } from "../../../containers/ui/workspace/ContainerWorkspace";
import { StatusSettings } from "../../../page-status/ui/workspace/StatusSettings";
import { AutomationWorkspace } from "../../../automation/ui/workspace/AutomationWorkspace";
import { ActivityWorkspace } from "../../../activity/ui/workspace/ActivityWorkspace";
import { PersonalPreferences } from "../../../navigation/ui/workspace/PersonalPreferences";
import { useEffect, useRef, useState } from "react";
import { ConnectionsPanel } from "../../../connectors/ui/workspace/ConnectionsPanel";
import { WorkspacePreferences } from "./WorkspacePreferences";
import { AppearancePanel } from "./AppearancePanel";
import { PortabilityPanel } from "./PortabilityPanel";
import { MembersPanel } from "./MembersPanel";
import { TopBar } from "../../../../app/ui/header/TopBar";
import { PageTitle } from "../../../../app/ui/header/PageTitle";
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
  const tabs = useRef<HTMLElement>(null);
  const flagship = useFlagshipEnabled();
  const [section, setSection] = useState<string>("workspace");
  useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("section");if(requested&&sections.some(([id])=>id===requested))setSection(requested);},[]);
  return (
    <>
      <TopBar trail={[{ label: "Settings" }]}>
        <a href="/app">Back to workspace</a>
      </TopBar>
      <section className="main settings-workspace">
        <PageTitle>Settings</PageTitle>
        <nav ref={tabs} className="tabs tabs-rule settings-tabs" aria-label="Settings sections">
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
        <div className="settings-scroll-controls"><button type="button" className="secondary-button" aria-label="Previous settings sections" onClick={() => tabs.current?.scrollBy({left:-260,behavior:"smooth"})}>←</button><span>Scroll for more sections</span><button type="button" className="secondary-button" aria-label="More settings sections" onClick={() => tabs.current?.scrollBy({left:260,behavior:"smooth"})}>→</button></div>
        {section === "chat" ? (
          <ChatNotifications />
        ) : section === "spaces" ? (
          <ContainerWorkspace embedded />
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
