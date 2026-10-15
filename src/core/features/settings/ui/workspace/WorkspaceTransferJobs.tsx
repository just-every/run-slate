import { TransferCounts } from "./TransferCounts";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
import {
  ApiError,
  request,
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import type { JobEnvelope as TransferJob } from "../../../portability/jobs-store";
export function WorkspaceTransferJobs({
  restoreOnly = false,
}: {
  restoreOnly?: boolean;
}) {
  const { member } = useWorkspace();
  const storageKey = `slate:transfer:${member.email}`;
  const [job, setJob] = useState<TransferJob>(),
    [error, setError] = useState<unknown>(),
    [working, setWorking] = useState(false);
  const alive = useRef(true),
    generation = useRef(0),
    stageKey = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    const version = ++generation.current;
    const id = localStorage.getItem(storageKey);
    if (id)
      void request<TransferJob>(`/api/exports/jobs/${encodeURIComponent(id)}`)
        .then((value) => {
          if (alive.current && generation.current === version) setJob(value);
        })
        .catch((cause) => {
          if (alive.current && generation.current === version) setError(cause);
        });
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [storageKey]);
  useEffect(() => {
    if (
      !job ||
      (!working && job.state !== "running") ||
      !["queued", "running"].includes(job.state)
    )
      return;
    let active = true,
      busy = false;
    const version = generation.current;
    const timer = setInterval(
      () => {
        if (busy) return;
        busy = true;
        void request<TransferJob>(`/api/exports/jobs/${job.id}`)
          .then((value) => {
            if (active && alive.current && generation.current === version)
              setJob(value);
          })
          .catch((cause) => {
            if (active && generation.current === version) setError(cause);
          })
          .finally(() => {
            busy = false;
          });
      },
      working ? 250 : 1000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [working, job?.id, job?.state]);
  async function run(value: TransferJob) {
    setWorking(true);
    setError(undefined);
    const version = ++generation.current;
    try {
      const result = await mutate<TransferJob>(
        `/api/exports/jobs/${value.id}/run`,
        {},
      );
      if (alive.current && generation.current === version) {
        setJob(result);
        setError(undefined);
      }
    } catch (cause) {
      if (alive.current && generation.current === version) {
        setError(cause);
        try {
          const status = await request<TransferJob>(
            `/api/exports/jobs/${value.id}`,
          );
          if (alive.current && generation.current === version) setJob(status);
        } catch (statusError) {
          if (alive.current && generation.current === version)
            setError(statusError);
        }
      }
    } finally {
      if (generation.current === version) {
        generation.current++;
        if (alive.current) setWorking(false);
      }
    }
  }
  async function stage(form?: FormData) {
    const version = ++generation.current;
    setWorking(true);
    setError(undefined);
    stageKey.current ??= operationKey();
    try {
      if (form) form.set("operationKey", stageKey.current);
      const value = form
        ? await request<TransferJob>("/api/exports/jobs/restore", {
            method: "POST",
            body: form,
          })
        : await mutate<TransferJob>("/api/exports/jobs/workspace", {
            operationKey: stageKey.current,
          });
      if (!alive.current || generation.current !== version) return;
      stageKey.current = null;
      localStorage.setItem(storageKey, value.id);
      setJob(value);
      await run(value);
    } catch (cause) {
      if (!alive.current || generation.current !== version) return;
      setError(cause);
      setWorking(false);
    }
  }
  return (
    <section>
      <h3>
        {restoreOnly ? "Restore a workspace" : "Take your workspace with you"}
      </h3>
      <p>
        Export pages, records, relationships, history and retained files.
        Credentials are excluded; restored integrations require reconnection.
      </p>
      {!restoreOnly ? (
        <button className="secondary-button" disabled={working} onClick={() => void stage()}>
          Export workspace
        </button>
      ) : null}
      <details open={restoreOnly || undefined}>
        <summary>Restore into an empty deployment</summary>
        <p>
          Restoration requires the setup owner and an empty deployment. Public
          exposure and automation authority must be enabled again after
          restoration.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void stage(new FormData(event.currentTarget));
          }}
        >
          <label>
            Slate archive
            <input name="file" type="file" accept=".zip" required />
          </label>
          <button className="primary-button" type="submit" disabled={working}>Restore workspace</button>
        </form>
      </details>
      {working && !job ? <p role="status">Requesting a transfer job…</p> : null}
      {error ? <p role="alert">{errorMessage(error)}{error instanceof ApiError && error.code === "STEP_UP_REQUIRED" && typeof window !== "undefined" && ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname) ? <> On this computer, open the <a href="/__dev/outbox" target="_blank" rel="noreferrer">local outbox</a>, choose the confirmation message, then return here and export again.</> : null}</p> : null}
      {job ? (
        <section aria-label="Workspace transfer job" aria-live="polite">
          <h3>
            {job.kind === "export" ? "Export" : "Restore"} · {job.state}
          </h3>
          <TransferCounts counts={job.counts} />
          {job.report.code ? <p>{job.report.code}</p> : null}
          {job.report.message ? <p>{job.report.message}</p> : null}
          {job.state === "completed" && job.downloadPath ? (
            <a className="transfer-action" href={job.downloadPath}>Download workspace archive</a>
          ) : null}
          {job.kind === "restore" && job.state === "completed" ? (
            <>
              <p>
                The restored workspace requires a fresh sign-in. Reconnect
                integrations and review restored authority before enabling it.
              </p>
              <a className="transfer-action" href="/app">Open restored workspace</a>
            </>
          ) : null}
          {!working && job.state === "queued" ? (
            <button className="secondary-button" onClick={() => void run(job)}>Run queued transfer</button>
          ) : null}
          {!working && job.state === "failed" && job.kind === "export" ? (
            <button className="secondary-button" onClick={() => void stage()}>Start another export</button>
          ) : null}
          {job.state === "failed" && job.kind === "restore" ? (
            <p>Choose the archive above to start a new restore operation.</p>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
