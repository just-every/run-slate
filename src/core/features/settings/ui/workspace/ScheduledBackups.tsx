import { useRef, useState } from "react";
import { RequestState } from "../../../../app/ui/RequestState";
import { useResource } from "../../../../client/useResource";
import { errorMessage, mutate, operationKey } from "../../../../client/transport";
import { BackupDestinationForm } from "./ScheduledBackups/BackupDestinationForm";
import { BackupDestinationCard } from "./ScheduledBackups/BackupDestinationCard";

export interface BackupDestination {
  id: string;
  name: string;
  kind: "s3" | "r2";
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  schedule: "nightly" | "weekly";
  time: string;
  weekday: number;
  retention: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  lastFailureCode: string | null;
  drillReport: { state: string; message: string; checkedAt?: string } | null;
}

export interface BackupDrill {
  report: NonNullable<BackupDestination["drillReport"]>;
  downloadPath: string;
  instructions: string[];
}

type BackupAction = "test" | "run" | "drill" | "remove";

export function ScheduledBackups() {
  const destinations = useResource<{ destinations: BackupDestination[] }>("/api/backups");
  const [pending, setPending] = useState<string>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>();
  const [drills, setDrills] = useState<Record<string, BackupDrill>>({});
  const actionKeys = useRef(new Map<string, string>());
  const busy = useRef(false);

  async function act(destination: BackupDestination, action: BackupAction) {
    if (busy.current) return;
    busy.current = true;
    const key = `${destination.id}:${action}`;
    const path = `/api/backups/${encodeURIComponent(destination.id)}`;
    const labels = { test: "Testing connection", run: "Running backup", drill: "Validating restore archive", remove: "Removing destination" };
    setPending(`${labels[action]} for ${destination.name}…`);
    setNotice("");
    setError(undefined);
    if (!actionKeys.current.has(key)) actionKeys.current.set(key, operationKey());
    const body = { operationKey: actionKeys.current.get(key)! };
    try {
      if (action === "test") {
        await mutate<{ ok: true }>(`${path}/test`, body);
        setNotice(`Connection test passed for ${destination.name}.`);
      } else if (action === "run") {
        const result = await mutate<{ run: { state: string; errorCode?: string }; destination: BackupDestination }>(`${path}/run`, body);
        setNotice(`Backup for ${destination.name}: ${result.run.state}${result.run.errorCode ? ` (${result.run.errorCode})` : ""}.`);
      } else if (action === "drill") {
        const result = await mutate<BackupDrill>(`${path}/drill`, body);
        setDrills(previous => ({ ...previous, [destination.id]: result }));
        setNotice(`Restore validation report ready for ${destination.name}.`);
      } else {
        await mutate<{ removed: true }>(path, body, "DELETE");
        setDrills(previous => {
          const next = { ...previous };
          delete next[destination.id];
          return next;
        });
        setNotice(`Backup destination ${destination.name} removed.`);
      }
      actionKeys.current.delete(key);
      await destinations.reload();
    } catch (cause) {
      setError(cause);
    } finally {
      busy.current = false;
      setPending(undefined);
    }
  }

  return (
    <section className="workspace-transfer-panel" aria-label="Scheduled backups" aria-live="polite">
      <h3>Scheduled backups</h3>
      <p>Send workspace archives to your own S3-compatible bucket or Cloudflare R2. Saving a destination enables its schedule; no destination is configured automatically.</p>
      <BackupDestinationForm disabled={!!pending} onSaved={async destination => {
        setNotice(`Backup schedule saved for ${destination.name}.`);
        await destinations.reload();
      }} />
      {pending ? <p role="status">{pending} Completion has not been confirmed.</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p className="request-notice" role="alert">{errorMessage(error)}</p> : null}
      <RequestState loading={destinations.loading} error={destinations.error} retry={() => void destinations.reload()}>
        {destinations.data?.destinations.length === 0 ? <p className="muted">No backup destinations configured.</p> : null}
        {destinations.data?.destinations.map(destination => (
          <BackupDestinationCard key={destination.id} destination={destination} drill={drills[destination.id]} disabled={!!pending}
            onAction={action => void act(destination, action)} />
        ))}
      </RequestState>
    </section>
  );
}
