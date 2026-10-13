import { createContext, useContext } from "react";

/**
 * True while the static run site (run-slate.com) renders the landing and the docs: links are plain anchors, and nothing
 * links to an instance-only route such as sign-in. An installed Slate renders the docs with it false.
 */
export const RunSite = createContext(false);

export const useRunSite = () => useContext(RunSite);
