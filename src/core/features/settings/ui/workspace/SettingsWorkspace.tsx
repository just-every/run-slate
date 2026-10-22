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
import { SamlSettings } from "./SamlSettings";
import { TopBar } from "../../../../app/ui/header/TopBar";
import { PageTitle } from "../../../../app/ui/header/PageTitle";
import { Link, useSearch } from "@tanstack/react-router";
const sections = [
  ["workspace", "Workspace"],
  ["members", "People"],
  ["saml", "SAML single sign-on"],
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
  const [scrollReady, setScrollReady] = useState(false);
  // Links work from the server HTML; these controls need their React handlers.
  useEffect(() => setScrollReady(true), []);
  const flagship = useFlagshipEnabled();
  const requested = useSearch({ from: "/app/settings" }).section;
  const section = sections.some(([id]) => id === requested) ? requested : "workspace";
  return (
    <>
      <TopBar trail={[{ label: "Settings" }]}>
        <a href="/app">Back to workspace</a>
      </TopBar>
      <section className="main settings-workspace">
        <PageTitle>Settings</PageTitle>
        <div className="settings-section-navigation" data-portability={section === "portability"}>
        <nav ref={tabs} className="tabs tabs-rule settings-tabs" aria-label="Settings sections">
          {sections.filter(([id]) => flagship || id !== "connections").map(([id, label]) => (
            <Link
              key={id}
              to="/app/settings"
              search={{ section: id }}
              replace
              aria-current={section === id ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="settings-scroll-controls">
          <button type="button" className="secondary-button" aria-label="Previous settings sections" disabled={!scrollReady} onClick={() => tabs.current?.scrollBy({ left: -260, behavior: "smooth" })}>←</button>
          <span>Scroll for more sections</span>
          <button type="button" className="secondary-button" aria-label="More settings sections" disabled={!scrollReady} onClick={() => tabs.current?.scrollBy({ left: 260, behavior: "smooth" })}>→</button>
        </div>
        </div>
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
        ) : section === "saml" ? (
          <SamlSettings />
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
