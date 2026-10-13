import { request } from "../../client/transport";
import type { Resource } from "../../client/useResource";
import { useWorkspace } from "./WorkspaceContext";
import { inferPageSpace, type SpaceChoice } from "./pageDestination";

/**
 * The space a page made from this screen goes to, named before the click and resolved again at the
 * click. A space list that failed to load is read once more so its refusal reaches the creator.
 */
export function useInferredSpace(current: string | null | undefined, spaces: Resource<{ items: SpaceChoice[] }>) {
  const { navigation } = useWorkspace();
  const recents = navigation.data?.recents;
  const space = spaces.data ? inferPageSpace({ current, recents, spaces: spaces.data.items }) : undefined;
  async function resolve(): Promise<SpaceChoice | null> {
    const items = spaces.data?.items ?? (await request<{ items: SpaceChoice[] }>("/api/containers")).items;
    return inferPageSpace({ current, recents, spaces: items });
  }
  return { space, resolve };
}
