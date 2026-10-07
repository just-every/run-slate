import {WorkspaceTransferJobs} from './WorkspaceTransferJobs';
import { useEffect,useState } from "react";
import {
  request,
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
interface Job {
  id: string;
  state: string;
  revisionId?: string;
  counts?: Record<string, number>;
  report?: {
    created?: Entry[];
    unmapped?: Entry[];
    warnings?: Entry[];
    failure?: string;
    message?: string;
  };
}
interface Entry {
  label: string;
  detail?: string;
}
const formats = [
  ["notion-workspace", "Notion workspace"],
  ["confluence-space", "Confluence space"],
  ["docx", "Word document"],
  ["google-docx", "Google Docs (Word export)"],
  ["google-html-zip", "Google Docs (HTML archive)"],
  ["markdown", "Markdown"],
  ["html", "HTML"],
  ["text", "Plain text"],
  ["csv", "CSV"],
  ["pdf", "PDF"],
  ["epub", "EPUB"],
];
export function PortabilityPanel() {
  const { member } = useWorkspace();
  const [job, setJob] = useState<Job>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  useEffect(()=>{if(!pending||!job?.id)return;let active=true;const timer=setInterval(()=>{void request<Job>(`/api/imports/${job.id}`).then(fresh=>{if(active)setJob(fresh);}).catch(cause=>{if(active)setError(cause);});},500);return()=>{active=false;clearInterval(timer);};},[pending,job?.id]);
  async function action(work: () => Promise<void>) {
    setPending(true);
    setError(undefined);
    try {
      await work();
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  async function run(id: string) {
    try {
      setJob(await mutate<Job>(`/api/imports/${id}/run`, {}));
    } catch (cause) {
      setJob(await request<Job>(`/api/imports/${id}`));
      throw cause;
    }
  }
  return (
    <section className="settings-panel">
      <p className="eyebrow">YOUR KNOWLEDGE, YOURS</p>
      <h2>Bring it with you.</h2>
      <p>
        Import a document or archive. Slate keeps the original and reports
        anything it could not map.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          form.set("operationKey", operationKey());
          void action(async () => {
            const staged = await request<Job>("/api/imports", {
              method: "POST",
              body: form,
            });
            setJob(staged);
            await run(staged.id);
          });
        }}
      >
        <fieldset disabled={pending}>
          <label>
            Format
            <select name="format">
              {formats.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            File
            <input type="file" name="file" required />
          </label>
          <button className="primary">{pending ? "Working…" : "Import"}</button>
        </fieldset>
      </form>
      {pending?<p role="status">The server is processing this request. Completion has not been confirmed.</p>:null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
      {job ? (
        <section aria-live="polite">
          <h3>Import · {job.state}</h3>
          {job.counts ? (
            <dl>
              {Object.entries(job.counts).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {job.report?.failure?<p role="alert">{job.report.failure}</p>:null}
          {job.report?.message ? <p>{job.report.message}</p> : null}
          {(["created", "unmapped", "warnings"] as const).map((kind) =>
            job.report?.[kind]?.length ? (
              <div key={kind}>
                <h4>
                  {kind === "unmapped"
                    ? "Needs attention"
                    : kind === "warnings"
                      ? "Warnings"
                      : "Created"}
                </h4>
                <ul>
                  {job.report[kind]!.map((entry, index) => (
                    <li key={index}>
                      {entry.label}
                      {entry.detail ? ` — ${entry.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          <a href={`/api/imports/${job.id}/original`}>
            Download original archive
          </a>
          {job.state === "failed" ? (
            <button
              disabled={pending}
              onClick={() => void action(() => run(job.id))}
            >
              Retry import
            </button>
          ) : null}
          {job.state === "completed" ? (
            <a href="/app/search">Find imported pages</a>
          ) : null}
        </section>
      ) : null}
      {member.role === "owner" ? <WorkspaceTransferJobs/> : null}
    </section>
  );
}
