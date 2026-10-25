import { DateStamp } from "./displayDate";
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
  if (!page.publishAt) return null;
  return (
    <small className="scheduled-publication">
      {page.scheduleState === "failed"
        ? "Publication needs attention"
        : "Scheduled"}{" "}
      ·{" "}
      
        
      <DateStamp value={page.publishAt} />
      {page.scheduleFailure ? ` · ${page.scheduleFailure}` : null}
    </small>
  );
}
