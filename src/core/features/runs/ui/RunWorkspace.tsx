import { useResource } from "../../../client/useResource";
import { RequestState } from "../../../app/ui/RequestState";
import { RunPanel, type RunDocument } from "./RunPanel";
import { TopBar } from "../../../app/ui/header/TopBar";
import { PageTitle } from "../../../app/ui/header/PageTitle";
export function RunWorkspace({ id }: { id: string }) {
  const resource = useResource<RunDocument>(
    `/api/runs/${encodeURIComponent(id)}`,
  );
  const run = resource.data;
  return (
    <>
      <TopBar trail={[{ label: "Page", href: run?.pageId ? `/app/pages/${encodeURIComponent(run.pageId)}` : "/app" }, { label: "Run" }]} />
      <section className="main inquiry-document">
        <PageTitle>
          {run?.kind === "procedure"
            ? "The next useful step."
            : run?.kind === "edit"
              ? "A considered change."
              : "A clearer answer."}
        </PageTitle>
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
