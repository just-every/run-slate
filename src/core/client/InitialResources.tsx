import { createContext, useEffect, useState, type ReactNode } from "react";

/** Fresh data for this document's first render, never a client response cache. */
export type InitialResources = Record<string, any>;
export const InitialResourcesContext = createContext<InitialResources>({});
export function InitialResourcesProvider({ resources, children }: { resources: InitialResources; children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // Later mounts fetch current data. Already mounted resources retain their own
  // ordering, cancellation, validation and explicit mutation refresh boundaries.
  return <InitialResourcesContext.Provider value={hydrated ? {} : resources}>{children}</InitialResourcesContext.Provider>;
}
