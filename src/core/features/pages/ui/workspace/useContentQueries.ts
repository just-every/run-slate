import { useEffect, useState } from "react";
import { request, ApiError, errorMessage } from "../../../../client/transport";
import type {
  EditorBlock,
  ContentQueryBlockData,
} from "../../../editor/ui/types";
export function useContentQueries(pageId: string, blocks: EditorBlock[]) {
  const definitions = JSON.stringify(
    blocks
      .filter(
        (block): block is ContentQueryBlockData =>
          block.type === "content-query",
      )
      .map((block) => ({ id: block.id, definition: block.definition })),
  );
  const [generation, setGeneration] = useState(0),
    [results, setResults] = useState<
      Record<string, Partial<ContentQueryBlockData>>
    >({});
  useEffect(() => {
    let active = true;
    setResults({});
    void Promise.all(
      JSON.parse(definitions).map(
        async ({
          id,
          definition,
        }: {
          id: string;
          definition: ContentQueryBlockData["definition"];
        }) => {
          try {
            const labels = await request<{
              items: { id: string; containerLabel: string; pageKind: string }[];
            }>("/api/pages");
            const response = await request<{
              items: { id: string; title: string; containerId: string }[];
              ranAt: string;
            }>(`/api/pages/${pageId}/query`, {
              method: "POST",
              body: JSON.stringify(definition),
              headers: { "Content-Type": "application/json" },
            });
            if (active)
              setResults((old) => ({
                ...old,
                [id]: {
                  results: response.items.map((item) => ({
                    id: item.id,
                    title: item.title,
                    typeLabel:
                      labels.items.find((page) => page.id === item.id)
                        ?.pageKind === "record"
                        ? "Record"
                        : "Page",
                    containerLabel:
                      labels.items.find((page) => page.id === item.id)
                        ?.containerLabel ?? "Unavailable space",
                  })),
                  lastRanLabel: new Date(response.ranAt).toLocaleString(),
                  sourceMissing: undefined,
                },
              }));
          } catch (error) {
            if (active)
              setResults((old) => ({
                ...old,
                [id]: {
                  results: [],
                  lastRanLabel: new Date().toLocaleString(),
                  sourceMissing: {
                    message:
                      error instanceof ApiError && error.status === 404
                        ? "The query source is unavailable."
                        : errorMessage(error),
                  },
                },
              }));
          }
        },
      ),
    );
    return () => {
      active = false;
    };
  }, [pageId, definitions, generation]);
  return {
    blocks: blocks.map((block) =>
      block.type === "content-query"
        ? {
            ...block,
            results: [],
            lastRanLabel: "Running…",
            ...results[block.id],
          }
        : block,
    ),
    rerun: () => setGeneration((value) => value + 1),
  };
}
