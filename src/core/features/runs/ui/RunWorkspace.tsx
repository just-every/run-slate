import { useResource } from "../../../client/useResource";
import { RequestState } from "../../../app/ui/RequestState";
import { RunPanel, type RunDocument } from "./RunPanel";
export function RunWorkspace({ id }: { id: string }) {
  const resource = useResource<RunDocument>(
    `/api/runs/${encodeURIComponent(id)}`,
  );
  const run = resource.data;
  return (
    <>
      <header className="topbar">
        <a
          href={
            run?.pageId
              ? `/app/pages/${encodeURIComponent(run.pageId)}`
              : "/app"
          }
        >
          Back to the page
        </a>
      </header>
      <section className="main inquiry-document">
        <p className="eyebrow">YOUR WORK, WITH ITS EVIDENCE</p>
        <h1 className="title">
          {run?.kind === "procedure"
            ? "The next useful step."
            : run?.kind === "edit"
              ? "A considered change."
              : "A clearer answer."}
        </h1>
        <RequestState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          {run ? <RunPanel id={id} /> : null}
        </RequestState>
      </section>
    </>
  );
}
