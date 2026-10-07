import {InquiryControls} from "./InquiryControls";
import {
  FindingRecords,
  FindingSources,
  type FindingArtifact,
  type FindingReference,
} from "./FindingRecords";
import { AnalysisRecord, type Analysis } from "./AnalysisRecord";
import { useEffect } from "react";
import { useResource } from "../../../client/useResource";
import { RequestState } from "../../../app/ui/RequestState";
import { RunPanel } from "../../runs/ui/RunPanel";
import { TrialPanel, type Trial } from "../../experiments/ui/TrialPanel";
interface Inquiry {
  id: string;
  revisionId: string;
  question: string;
  pageRef: { id: string; title: string };
  interimFinding: {
    text: string;
    kind: string;
    stopped?:boolean;
    refs?: FindingReference[];
  } | null;
  hypotheses: {
    id: string;
    statement: string;
    disconfirmation: string;
    status: string;
    run_id: string | null;
  }[];
  trials: Trial[];
  unresolved: string[];
  methodRevision: string | null;
  analyses: Analysis[];
  artifacts: FindingArtifact[];
}
export function InquiryWorkspace({ id }: { id: string }) {
  const resource = useResource<Inquiry>(`/api/inquiries/${id}`);
  const inquiry = resource.data;
  useEffect(() => {
    if (
      !inquiry || inquiry.interimFinding?.stopped ||
      (!inquiry.hypotheses.some((item) => item.status === "open") &&
        !inquiry.trials.some((item) => item.state === "active"))
    )
      return;
    const timer = setTimeout(resource.reload, 5000);
    return () => clearTimeout(timer);
  }, [inquiry, resource.reload]);
  return (
    <>
      <header className="topbar">
        <a href={inquiry ? `/app/pages/${inquiry.pageRef.id}` : "/app"}>
          {inquiry?.pageRef.title ?? "Workspace"}
        </a>
        <button onClick={resource.reload}>Refresh findings</button>
      </header>
      <section className="main inquiry-document">
        <RequestState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          {inquiry ? (
            <>
              <p className="eyebrow">A QUESTION WORTH WORKING THROUGH</p>
              <h1 className="title">{inquiry.question}</h1>
              {inquiry.interimFinding?.text ? (
                <section className="finding">
                  <span className="eyebrow">{inquiry.interimFinding.kind}</span>
                  <h2>{inquiry.interimFinding.text}</h2>
                  {inquiry.interimFinding.refs?.length ? (
                    <FindingSources
                      refs={inquiry.interimFinding.refs}
                      prefix={`interim-${inquiry.id}`}
                    />
                  ) : null}
                </section>
              ) : (
                <p className="intro">
                  The investigations are still being weighed. No conclusion has
                  been established.
                </p>
              )}
              <section>
                <h2>Competing explanations</h2>
                <div className="hypotheses">
                  {inquiry.hypotheses.map((hypothesis, index) => (
                    <article key={hypothesis.id}>
                      <p className="eyebrow">
                        {String(index + 1).padStart(2, "0")} ·{" "}
                        {hypothesis.status}
                      </p>
                      <h3>{hypothesis.statement}</h3>
                      <p>
                        <strong>What could disconfirm it:</strong>{" "}
                        {hypothesis.disconfirmation}
                      </p>
                      {hypothesis.run_id ? (
                        <details>
                          <summary>Read this investigation</summary>
                          <RunPanel id={hypothesis.run_id} />
                        </details>
                      ) : (
                        <p className="muted">
                          This investigation has no completed run yet.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
              {inquiry.unresolved.length ? (
                <section className="finding">
                  <h2>Still unknown</h2>
                  <ul>
                    {inquiry.unresolved.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <FindingRecords artifacts={inquiry.artifacts} />
              {inquiry.analyses.length ? (
                <section>
                  <h2>Analysis behind the finding</h2>
                  {inquiry.analyses.map((analysis) => (
                    <AnalysisRecord key={analysis.id} analysis={analysis} />
                  ))}
                </section>
              ) : null}
              {inquiry.trials.map((trial) => (
                <TrialPanel
                  key={trial.id}
                  trial={trial}
                  reload={resource.reload}
                />
              ))}
              {!inquiry.trials.length ? (
                <p className="muted">
                  No bounded trial has been prepared. Missing evidence must be
                  resolved before an intervention can be approved.
                </p>
              ) : null}
              {inquiry.methodRevision ? (
                <details><summary>Retained learning</summary><p style={{overflowWrap:"anywhere"}}>Method revision {inquiry.methodRevision}</p><p>The original forecast and observed outcome remain together. This learning is not approved policy; a reusable procedure still needs a passing evaluation before activation.</p></details>
              ) : null}
            </>
          ) : null}
        </RequestState>
        <InquiryControls id={id} revisionId={inquiry?.revisionId} stopped={inquiry?.interimFinding?.stopped} reload={resource.reload}/>
      </section>
    </>
  );
}
