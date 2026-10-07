import { Link } from "@tanstack/react-router";
import { useFlagshipEnabled } from "./LaunchProfile";
import { isFlagshipPath } from "../../platform/config/launch-profile";
import {ScheduledPublication} from './ScheduledPublication';
import {mutate,operationKey,errorMessage} from "../../client/transport";
import { PageTree, type TreePage } from "./PageTree";
import {
  Database,
  CalendarDays,
  Search,
  FileText,
  Settings,
  Archive,
  LayoutTemplate,
  Plus,
  ChevronDown,
} from "lucide-react";
import { useEffect,useState } from "react";
import { ExtensionSlot } from "../ext-client";
import type { PageRef } from "../../shared/api/content";
import type { PageResult } from "../../shared/api/common";
import { useResource } from "../../client/useResource";
import { useWorkspace } from "./WorkspaceContext";
import { RequestState } from "./RequestState";
import { CreateDatabaseDialog } from "../../features/databases/ui/workspace/CreateDatabaseDialog";
import { CreatePageDialog } from "./CreatePageDialog";

export function AppNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { member } = useWorkspace();
  return <MemberNavigation key={`${member.workspaceId}:${member.id}`} onNavigate={onNavigate} />;
}

function MemberNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { member, workspace, navigation } = useWorkspace();
  const flagship = useFlagshipEnabled();
  const pages = useResource<PageResult<TreePage>>("/api/pages");
  const databases = useResource<{ items: { id: string; title: string }[] }>(
    "/api/databases",
  );
  useEffect(() => {
    const refreshRecents = () => { void navigation.reload(); };
    const refreshTree = () => { refreshRecents(); void pages.reload(); };
    window.addEventListener("slate:page-opened", refreshRecents);
    window.addEventListener("slate:navigation-changed", refreshTree);
    return () => {
      window.removeEventListener("slate:page-opened", refreshRecents);
      window.removeEventListener("slate:navigation-changed", refreshTree);
    };
  }, [navigation.reload, pages.reload]);
  const containers=useResource<{items:{id:string;name:string}[]}>("/api/containers");
  const [create, setCreate] = useState(false);
  const [createDatabase, setCreateDatabase] = useState(false);
  const [createMenu,setCreateMenu]=useState(false);
  const [error,setError]=useState<unknown>();
  const [more, setMore] = useState(false);
  return (
    <aside className="sidebar" data-collapsed={navigation.data?.preferences.value.sidebarCollapsed}>
      <button className="sidebar-toggle" onClick={()=>{if(navigation.data)void mutate("/api/navigation/preferences",{operationKey:operationKey(),expectedRevisionId:navigation.data.preferences.revisionId,value:{...navigation.data.preferences.value,sidebarCollapsed:!navigation.data.preferences.value.sidebarCollapsed}},"PUT").then(navigation.reload).catch(setError);}} aria-label={navigation.data?.preferences.value.sidebarCollapsed ? "Expand sidebar":"Collapse sidebar"}>☰</button>
      <div className="sidebar-content">
      <Link className="brand" to="/app" activeOptions={{ exact: true }} activeProps={{ className: "" }} data-testid="nav-workspace">
        <span className="brand-mark" aria-hidden="true">
          ✳
        </span>
        <span data-testid="workspace-name">
          {workspace.data?.name ?? member.workspaceName}
        </span>
      </Link>
      <nav
        className="primary"
        aria-label="Workspace navigation"
        onClick={onNavigate}
      >
        {navigation.data?.configuration?.destinations.filter(item=>item.visible && (flagship || !isFlagshipPath(item.href))).map(item=><Link key={item.id} className="navlink" to={item.href} activeOptions={{ exact: item.href === "/app" }} activeProps={{ className: "" }}>{item.href==='/app/search'?<Search/>:<CalendarDays/>}{item.label}{item.href==='/app/search'?<span className="shortcut">⌘ K</span>:null}</Link>)}
      </nav>
      {navigation.data?.favourites.length ? (
        <nav aria-label="Favourites">
          <p className="eyebrow">Favourites</p>
          {navigation.data.favourites
            .map((item) => (
              <div key={item.id} className="favourite-row"><a className="navlink" href={item.href}>{item.title}<ScheduledPublication page={item}/></a><button aria-label={`Move ${item.title} up`} onClick={()=>{const at=navigation.data!.favourites.findIndex(f=>f.id===item.id);if(at<1)return;void Promise.all([mutate("/api/navigation/favourites",{operationKey:operationKey(),kind:item.kind,id:item.id,enabled:true,position:at-1},"PUT"),mutate("/api/navigation/favourites",{operationKey:operationKey(),kind:navigation.data!.favourites[at-1].kind,id:navigation.data!.favourites[at-1].id,enabled:true,position:at},"PUT")]).then(navigation.reload).catch(setError);}}>↑</button><button aria-label={`Unfavourite ${item.title}`} onClick={()=>void mutate("/api/navigation/favourites",{operationKey:operationKey(),kind:item.kind,id:item.id,enabled:false},"PUT").then(navigation.reload).catch(setError)}>×</button></div>
            ))}
        </nav>
      ) : null}
      {!navigation.data?.preferences.value.sidebarCollapsed &&
      navigation.data?.recents.length ? (
        <details>
          <summary>Recently opened</summary>
          {navigation.data.recents.slice(0, 8).map((item) => (
            <a
              className="navlink"
              key={item.id}
              href={`/app/pages/${item.id}`}
              title={item.day}
            >
              {item.title}<ScheduledPublication page={item}/>
            </a>
          ))}
        </details>
      ) : null}
      <button className="primary-button" onClick={()=>setCreateMenu(!createMenu)} aria-expanded={createMenu}>Create</button>
      {createMenu ? <nav aria-label="Create content"><button onClick={()=>{setCreate(true);setCreateMenu(false);}}>Page</button><button onClick={()=>{setCreateDatabase(true);setCreateMenu(false);}}>Database</button><a href="/app/containers?create=true">Space</a><a href="/app/templates">Page from template</a></nav>:null}
      {error ? <p role="alert">{errorMessage(error)}</p>:null}
      <div className="pagesbar">
        <span>Pages</span>
        <button
          className="iconbutton"
          type="button"
          aria-label="Create a page"
          onClick={() => setCreate(true)}
        >
          <Plus />
        </button>
      </div>
      <nav className="page-links" aria-label="Pages" onClick={onNavigate}>
        <RequestState
          loading={pages.loading}
          error={pages.error}
          retry={pages.reload}
        >
          {[...new Set(pages.data?.items.map(page=>page.containerId))].map(id=><details key={id} open={!navigation.data?.preferences.value.collapsedContainers.includes(id)}><summary onClick={event=>{event.preventDefault();if(!navigation.data)return;const prefs=navigation.data.preferences;void mutate('/api/navigation/preferences',{operationKey:operationKey(),expectedRevisionId:prefs.revisionId,value:{...prefs.value,collapsedContainers:prefs.value.collapsedContainers.includes(id)?prefs.value.collapsedContainers.filter(value=>value!==id):[...prefs.value.collapsedContainers,id]}},'PUT').then(navigation.reload).catch(setError);}}>{containers.data?.items.find(item=>item.id===id)?.name??`Shared with me · ${pages.data?.items.find(page=>page.containerId===id)?.containerLabel??'Unavailable space'}`}</summary><PageTree pages={pages.data?.items.filter(page=>page.containerId===id)??[]}/></details>)}
          {databases.data?.items.map((database) => (
            <a
              className="navlink"
              key={database.id}
              href={`/app/databases/${database.id}`}
            >
              <Database />
              <span>{database.title}</span>
            </a>
          ))}
          {pages.data?.items.length === 0 ? (
            <p className="empty-tree">Your first page starts here.</p>
          ) : null}
        </RequestState>
      </nav>
      <ExtensionSlot id="workspace.navigation.after.v1" />
      <div className="workspace">
        <button
          className="workrow"
          type="button"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          <span data-testid="member-initials" className="member-initials">
            {member.initials}
          </span>
          <span data-testid="member-name">{member.displayName}</span>
          <ChevronDown />
        </button>
        {more ? (
          <nav aria-label="Workspace tools">
            <button className="navlink" onClick={() => setCreateDatabase(true)}>
              <Database />
              New database
            </button>
            <a className="navlink" href="/app/templates">
              <LayoutTemplate />
              Templates
            </a>
            <a className="navlink" href="/app/archive">
              <Archive />
              Archive & trash
            </a>
            <a className="navlink" href="/app/settings">
              <Settings />
              Settings
            </a>
          </nav>
        ) : null}
      </div>
      </div>
      {createDatabase ? (
        <CreateDatabaseDialog onClose={() => setCreateDatabase(false)} />
      ) : null}
      {create ? (
        <CreatePageDialog
          onClose={() => setCreate(false)}
          onCreated={(id) =>
            window.location.assign(`/app/pages/${encodeURIComponent(id)}`)
          }
        />
      ) : null}
    </aside>
  );
}
