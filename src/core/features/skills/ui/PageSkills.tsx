import { useState } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RequestState } from "../../../app/ui/RequestState";
import { EvaluationPanel } from "./EvaluationPanel";
import { GuidedTask } from "./GuidedTask";
interface SkillVersion {
  id: string;
  state: string;
  evaluation_id: string | null;
  evaluations: {id: string; state: string}[];
  definition: {
    instructions: string;
    maxCostMicros: number;
    audience: string[];
    refs: {kind:string;sourceId:string;revisionId:string}[];
    preconditions: string[];
    successTests: string[];
    escalations: string[];
  };
}
interface Skill {
  id: string;
  name: string;
  current_revision_id: string;
  canEdit: boolean;
  canEvaluate: boolean;
  versions: SkillVersion[];
}
export function PageSkills({ pageId }: { pageId: string }) {
  const resource = useResource<{ items: Skill[] }>(
      `/api/skills?pageId=${encodeURIComponent(pageId)}`,
    ),
    tasks = useResource<{ items: { id: string; state: string }[] }>(
      `/api/skills/guided?pageId=${encodeURIComponent(pageId)}`,
    );
  return (
    <>
      <RequestState
        loading={tasks.loading}
        error={tasks.error}
        retry={tasks.reload}
      >
        {tasks.data?.items.map((task) => (
          <details key={task.id}>
            <summary>Procedure · {task.state}</summary>
            <GuidedTask id={task.id} />
          </details>
        ))}
      </RequestState>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        {resource.data?.items.length ? (
          <section>
            <h3>Reusable procedures</h3>
            {resource.data.items.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                reload={resource.reload}
              />
            ))}
          </section>
        ) : null}
      </RequestState>
    </>
  );
}
function SkillCard({ skill, reload }: { skill: Skill; reload: () => void }) {
  const [selectedId, setSelectedId] = useState(skill.current_revision_id);
  const selected = skill.versions.find(version => version.id === selectedId);
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  if (!selected) return null;
  async function transition(action: "activate" | "retire") {
    setPending(true);
    setError(undefined);
    try {
      await mutate(
        `/api/skills/${encodeURIComponent(selectedId)}/transition`,
        { operationKey: operationKey(), action },
      );
      reload();
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="finding" style={{minWidth:0,overflowWrap:"anywhere"}}>
      <p className="eyebrow">{selected.state} · {selectedId === skill.current_revision_id ? "Current revision" : "Separate revision"}</p>
      <h4>{skill.name}</h4>
      <div className="detail-form"><label>Revision to inspect
        <select style={{width:"100%",minWidth:0}} value={selectedId} disabled={pending} onChange={event => setSelectedId(event.target.value)}>
          {skill.versions.map(version => <option key={version.id} value={version.id}>
            {version.state}{version.evaluations.some(e => e.state === "failed") ? " · failed evaluation" : ""}{version.id === skill.current_revision_id ? " · current" : ""} · {version.id}
          </option>)}
        </select>
      </label></div>
      <p>Current revision: {skill.current_revision_id}. Drafts and evaluations do not replace it until activation.</p>
      <a href={`/api/skills/versions/${encodeURIComponent(selectedId)}/export`} download>Download this exact skill revision and evidence</a>
      {selected.state === "draft" ? (
        <p>
          Saved as a draft. A passing evaluation is required before this
          procedure can run as an active skill.
        </p>
      ) : null}
      <details>
        <summary>Scope & checks</summary>
        <p style={{ whiteSpace: "pre-wrap" }}>
          {selected.definition.instructions}
        </p>
        <p>Maximum cost per ordinary run: {selected.definition.maxCostMicros} micros.</p>
        <p>Audience: {selected.definition.audience.join(", ")}</p>
        <h5>Exact source revisions</h5>
        <ul>{selected.definition.refs.map((ref,index)=><li key={index}>{ref.kind} · {ref.sourceId} · {ref.revisionId}</li>)}</ul>
        <h5>Before starting</h5>
        <ul>
          {selected.definition.preconditions.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
        <h5>Completion checks</h5>
        <ul>
          {selected.definition.successTests.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
        {selected.definition.escalations.length ? (
          <>
            <h5>When to ask for help</h5>
            <ul>
              {selected.definition.escalations.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </>
        ) : null}
        <p>
          {selected.evaluation_id
            ? "An evaluation record is retained for this revision."
            : "No passing evaluation is recorded."}
        </p>
      </details>
      {skill.canEdit ? <EvaluationPanel key={selected.id} skillId={skill.id} revisionId={selected.id} state={selected.state} evaluations={selected.evaluations} canPrepare={skill.canEvaluate} reload={reload} /> : null}
      {skill.canEdit && selected.state === "evaluated" ? (
        <button disabled={pending} onClick={() => void transition("activate")}>
          Activate evaluated procedure
        </button>
      ) : null}
      {skill.canEdit && selected.state === "active" ? (
        <button disabled={pending} onClick={() => void transition("retire")}>
          Retire this procedure
        </button>
      ) : null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </article>
  );
}
