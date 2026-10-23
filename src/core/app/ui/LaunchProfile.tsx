import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useShellResource } from "./useShellResource";
import { isFlagshipPath, switchForPath, type LaunchProfile } from "../../platform/config/launch-profile";
import type {FeatureKey, FeatureProfile} from '../../features/feature-switches/catalog';
import { RequestState } from "./RequestState";

export const LaunchProfileContext = createContext<LaunchProfile>("core-wiki");
const FeaturesContext = createContext<FeatureProfile>({profile: 'core-wiki'});
export function useFlagshipEnabled() { return useContext(LaunchProfileContext) === "flagship"; }
export function useFeatureEnabled(key: FeatureKey) {
  const state = useContext(FeaturesContext);
  return useFlagshipEnabled() || !!state.features?.[key];
}
export function useSurfaceAccess() {
  const state = useContext(FeaturesContext), flagship = useFlagshipEnabled();
  return (path: string) => {
    if (flagship || !isFlagshipPath(path)) return true;
    const key = switchForPath(path);
    return key ? !!state.features?.[key] : false;
  };
}

export function LaunchProfileProvider({ children, initial }: { children: ReactNode; initial: FeatureProfile }) {
  const resource = useShellResource("/api/profile", initial);
  const pathname = useLocation({ select: location => location.pathname });
  useEffect(() => {
    void resource.reload();
    const refresh = () => { void resource.reload(); };
    window.addEventListener('slate:features-changed', refresh);
    return () => window.removeEventListener('slate:features-changed', refresh);
  }, [initial, resource.reload]);
  const key = switchForPath(pathname);
  const allowed = resource.data?.profile === 'flagship' || !isFlagshipPath(pathname) || !!(key && resource.data?.features?.[key]);
  return <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
    {resource.data ? <LaunchProfileContext.Provider value={resource.data.profile}><FeaturesContext.Provider value={resource.data}>
      {!allowed
        ? <main><h1>Feature unavailable</h1><p>This feature is unavailable in the core-wiki profile.</p><a href="/app">Back to workspace</a></main>
        : children}
    </FeaturesContext.Provider></LaunchProfileContext.Provider> : null}
  </RequestState>;
}
