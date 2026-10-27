import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../../client/transport";
import type { Resource } from "../../client/useResource";

/** Use this route's fresh authenticated read; reload explicitly after writes.
 * A failed read clears the data; an older response cannot replace a newer route.
 */
export function useShellResource<T>(path: string, initial: T): Resource<T> {
  const [state, setState] = useState<{ initial: T; data?: T; error?: unknown; loading: boolean }>({ initial, data: initial, loading: false });
  const source = useRef({ path, initial });
  source.current = { path, initial };
  const sequence = useRef(0);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const read = useCallback(async (load: (signal: AbortSignal) => Promise<T>) => {
    const requested = source.current;
    const current = ++sequence.current;
    controller.current?.abort();
    const pending = new AbortController();
    controller.current = pending;
    if (!active.current) return false;
    setState(previous => previous.initial === requested.initial
      ? { ...previous, loading: previous.data === undefined, error: undefined }
      : { initial: requested.initial, data: requested.initial, loading: false });
    try {
      const data = await load(pending.signal);
      if (!active.current || pending.signal.aborted || sequence.current !== current || source.current.initial !== requested.initial || source.current.path !== requested.path) return false;
      setState({ initial: requested.initial, data, loading: false });
      return true;
    } catch (error) {
      if (active.current && !pending.signal.aborted && sequence.current === current && source.current.initial === requested.initial && source.current.path === requested.path)
        setState({ initial: requested.initial, error, loading: false });
      return false;
    }
  }, []);
  // Route retirement fences the response; the background GET can finish.
  const reload = useCallback(() => read(() => request<T>(source.current.path)), [read]);
  useEffect(() => {
    active.current = true;
    setState({ initial, data: initial, loading: false });
    return () => { active.current = false; ++sequence.current; controller.current?.abort(); };
  }, [path, initial, reload]);
  return { ...(state.initial === initial ? state : { data: initial, loading: false }), reload, read };
}
