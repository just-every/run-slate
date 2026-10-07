import { createContext, useContext, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useShellResource } from "./useShellResource";
import { isFlagshipPath, type LaunchProfile } from "../../platform/config/launch-profile";
import { RequestState } from "./RequestState";

export const LaunchProfileContext = createContext<LaunchProfile>("core-wiki");
export function useFlagshipEnabled() { return useContext(LaunchProfileContext) === "flagship"; }

export function LaunchProfileProvider({ children, initial }: { children: ReactNode; initial: { profile: LaunchProfile } }) {
  const resource = useShellResource("/api/profile", initial);
  const pathname = useLocation({ select: location => location.pathname });
  return <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
    {resource.data ? <LaunchProfileContext.Provider value={resource.data.profile}>
      {resource.data.profile === "core-wiki" && isFlagshipPath(pathname)
        ? <main><h1>Feature unavailable</h1><p>This feature is unavailable in the core-wiki profile.</p><a href="/app">Back to workspace</a></main>
        : children}
    </LaunchProfileContext.Provider> : null}
  </RequestState>;
}
