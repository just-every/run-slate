import { useResource } from "../../../client/useResource";
import type { Decision } from "./PageDecisions";
export function DecisionLineage({ id, label }: { id: string; label: string }) {
  const resource = useResource<Decision>(
    `/api/decisions/${encodeURIComponent(id)}`,
  );
  return resource.data ? (
    <a
      href={`/app/pages/${encodeURIComponent(resource.data.page_id)}?detail=ask`}
    >
      {label}: {resource.data.question}
    </a>
  ) : resource.error ? (
    <p>The linked decision is unavailable with current access.</p>
  ) : (
    <p role="status">Checking the linked decision…</p>
  );
}
