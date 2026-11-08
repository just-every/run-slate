import { useEffect, useState } from 'react';
import { request } from '../../../../client/transport';
import type { DatabaseDto, QueryDto, ViewDto } from '../../../../client/records';
import type { DatabaseViewDefinition } from '../../../editor/database-view-definition';

export type EmbeddedViewResult = QueryDto & Pick<DatabaseDto, 'database' | 'fields'> & { view: ViewDto };
/** Poll only the query door. Results never enter the page draft or its save path. */
export function useDatabaseView(pageId: string | undefined, definition: DatabaseViewDefinition) {
  const serialized = JSON.stringify(definition);
  const key = `${pageId ?? ''}:${serialized}`;
  const [state, setState] = useState<{ key: string; result?: EmbeddedViewResult; unavailable?: boolean }>({ key });
  useEffect(() => {
    if (!pageId || !definition.databaseId || !definition.viewId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const { databaseId, viewId, ...criteria } = JSON.parse(serialized) as DatabaseViewDefinition;
        const result = await request<EmbeddedViewResult>(`/api/databases/${encodeURIComponent(databaseId!)}/views/${encodeURIComponent(viewId!)}/query`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId, ...criteria }), signal: controller.signal,
        });
        if (!controller.signal.aborted) setState({ key, result });
      } catch {
        // Never retain records, counts or source names after a refused refresh.
        if (!controller.signal.aborted) setState({ key, unavailable: true });
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 1000);
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [pageId, serialized, key, definition.databaseId, definition.viewId]);
  return state.key === key ? state : { key };
}
