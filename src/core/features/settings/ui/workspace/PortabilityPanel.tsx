import { ReadableExportDialog } from '../../../workspace-export/ui/ReadableExportDialog';
import {WorkspaceTransferJobs} from './WorkspaceTransferJobs';
import { ScheduledBackups } from './ScheduledBackups';
import { useEffect,useState,useRef } from "react";
import {
  request,
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
import {ImportReview,type ImportView as Job} from "./ImportReview";
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
  ["slate-readable", "Slate readable archive"],
];
export function PortabilityPanel() {
  const { member } = useWorkspace();
  const [exporting, setExporting] = useState(false);
  const [job, setJob] = useState<Job>();
  const [jobs,setJobs]=useState<Job[]>([]);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(job){localStorage.setItem(`import-job:${member.id}`,job.id);setJobs(previous=>[job,...previous.filter(item=>item.id!==job.id)]);}},[job,member.id]);
  useEffect(()=>{let active=true;void request<{jobs:Job[]}>("/api/imports").then(result=>{if(active){setJobs(result.jobs);const selected=localStorage.getItem(`import-job:${member.id}`);setJob(result.jobs.find(item=>item.id===selected)??result.jobs[0]);}}).catch(setError);return()=>{active=false;};},[]);
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
      let next=await mutate<Job>(`/api/imports/${id}/run`, {});setJob(next);
      while(mounted.current&&next.state==='indexing'){next=await mutate<Job>(`/api/imports/${id}/resume`,{});setJob(next);}
    } catch (cause) {
      setJob(await request<Job>(`/api/imports/${id}`));
      throw cause;
    }
  }
  return (
    <section className="settings-panel portability-panel">
      <h2>Bring it with you.</h2>
      <p>
        Import a document or archive. Slate keeps the original and reports
        anything it could not map.
      </p>
      <section className="readable-export-panel">
      <h3>Readable workspace export</h3>
      <p>Download the pages you can read with their discussions, or bring a Slate readable archive back through the import form.</p>
      <button type="button" className="secondary-button" onClick={() => setExporting(true)}>Export readable workspace</button>
      {exporting ? <ReadableExportDialog id={member.workspaceId} workspace onClose={() => setExporting(false)} /> : null}
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          form.set("operationKey", operationKey());
          void action(async () => {
            const file=form.get('file');if(!(file instanceof File))throw new Error('Choose a source file.');
            const staged = await request<Job>("/api/imports/stream", {
              method: "POST",headers:{'Content-Type':'application/octet-stream','X-Import-Metadata':encodeURIComponent(JSON.stringify({operationKey:form.get('operationKey'),format:form.get('format'),name:file.name,mediaType:file.type,sizeBytes:file.size}))},
              body: file,
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
          <button className="primary-button" type="submit">{pending ? "Working…" : "Upload and review"}</button>
        </fieldset>
      </form>
      {pending?<p role="status">The server is processing this request. Completion has not been confirmed.</p>:null}
      {error ? <p className="request-notice" role="alert">{errorMessage(error)}</p> : null}
      {jobs.length?<label>Retained imports<select aria-label="Retained imports" disabled={pending} value={job?.id??''} onChange={event=>{const id=event.target.value;void request<Job>(`/api/imports/${id}`).then(setJob).catch(setError);}}>{jobs.map(item=><option key={item.id} value={item.id}>{item.filename??item.id} · {item.state}</option>)}</select></label>:null}
      {job ? <ImportReview key={`${job.id}:${job.report?.fingerprint??''}`} job={job} pending={pending} act={(verb,body)=>void action(async()=>{
        let next=await mutate<Job>(`/api/imports/${job.id}/${verb}`,body??{});setJob(next);
        while(mounted.current&&['preparing','running','indexing','undoing'].includes(next.state)) {next=await mutate<Job>(`/api/imports/${job.id}/resume`,{});setJob(next);}
      })}/> : null}
      {member.role === "owner" ? <WorkspaceTransferJobs/> : null}
      {member.role === "owner" ? <ScheduledBackups /> : null}
    </section>
  );
}
