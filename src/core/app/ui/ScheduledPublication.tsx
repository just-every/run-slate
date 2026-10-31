import {useWorkspace} from './WorkspaceContext';
export function ScheduledPublication({
  page,
}: {
  page: {
    id: string;
    publishAt?: string;
    scheduleState?: string;
    scheduleFailure?: string | null;
  };
}) {
  const {workspace} = useWorkspace();
  if (workspace.data?.policies["page.lifecycle.v1"] !== "draft-then-publish" || !page.publishAt) return null;
  return (
    <small className="scheduled-publication">
      {page.scheduleState === "failed"
        ? "Publication needs attention"
        : "Scheduled"}{" "}
      ·{" "}
      <time dateTime={page.publishAt}>
        {new Date(page.publishAt).toLocaleString()}
      </time>
      {page.scheduleFailure ? ` · ${page.scheduleFailure}` : null}
    </small>
  );
}
