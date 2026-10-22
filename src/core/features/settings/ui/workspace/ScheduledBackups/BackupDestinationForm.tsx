import { useId, useRef, useState } from "react";
import { errorMessage, mutate, operationKey } from "../../../../../client/transport";
import type { BackupDestination } from "../ScheduledBackups";

export const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function BackupDestinationForm({ disabled, onSaved }: {
  disabled: boolean;
  onSaved: (destination: BackupDestination) => Promise<void>;
}) {
  const helpId = useId();
  const [frequency, setFrequency] = useState("nightly");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const key = useRef<string | null>(null);
  const busy = useRef(false);
  return (
    <details>
      <summary>Add a backup destination</summary>
      <form className="detail-form" style={{ minWidth: 0 }} autoComplete="off"
        onChange={() => { key.current = null; }}
        onSubmit={async event => {
          event.preventDefault();
          if (busy.current) return;
          busy.current = true;
          const form = event.currentTarget;
          const data = new FormData(form);
          key.current ??= operationKey();
          setPending(true);
          setError(undefined);
          try {
            const result = await mutate<{ destination: BackupDestination }>("/api/backups", {
              operationKey: key.current,
              name: String(data.get("name")).trim(),
              kind: String(data.get("kind")),
              endpoint: String(data.get("endpoint")).trim(),
              region: String(data.get("region")).trim(),
              bucket: String(data.get("bucket")).trim(),
              prefix: String(data.get("prefix")).trim(),
              schedule: frequency,
              time: String(data.get("time")),
              weekday: Number(data.get("weekday") ?? 0),
              retention: Number(data.get("retention")),
              accessKeyId: String(data.get("accessKeyId")),
              secretAccessKey: String(data.get("secretAccessKey")),
            });
            for (const field of ["accessKeyId", "secretAccessKey"]) {
              (form.elements.namedItem(field) as HTMLInputElement).value = "";
              data.delete(field);
            }
            key.current = null;
            await onSaved(result.destination);
          } catch (cause) {
            setError(cause);
          } finally {
            busy.current = false;
            setPending(false);
          }
        }}>
        <fieldset disabled={disabled || pending} style={{ minWidth: 0, padding: 0, border: 0 }}>
          <legend>Destination and schedule</legend>
          <label>Destination name<input name="name" required /></label>
          <label>Provider<select name="kind" defaultValue="s3">
            <option value="s3">S3-compatible</option><option value="r2">Cloudflare R2</option>
          </select></label>
          <label>Endpoint<input name="endpoint" type="url" required placeholder="https://storage.example.com" spellCheck={false} /></label>
          <label>Region<input name="region" required spellCheck={false} /></label>
          <label>Bucket<input name="bucket" required spellCheck={false} /></label>
          <label>Key prefix<input name="prefix" spellCheck={false} /></label>
          <label>Access key ID<input name="accessKeyId" type="password" autoComplete="new-password" required spellCheck={false} aria-describedby={helpId} /></label>
          <label>Secret access key<input name="secretAccessKey" type="password" autoComplete="new-password" required spellCheck={false} aria-describedby={helpId} /></label>
          <p className="muted" id={helpId}>Credentials are submitted only when you save. Both credential fields clear after a successful save.</p>
          <label>Frequency<select name="schedule" value={frequency} onChange={event => setFrequency(event.target.value)}>
            <option value="nightly">Nightly</option><option value="weekly">Weekly</option>
          </select></label>
          <label>UTC time<input name="time" type="time" required /></label>
          {frequency === "weekly" ? <label>Weekly day<select name="weekday" defaultValue="0">
            {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
          </select></label> : null}
          <label>Retention count<input name="retention" type="number" min="1" step="1" required /></label>
          <p className="muted">Choose how many successful backups to keep at this destination. Times and weekly days use UTC.</p>
          <button type="submit" className="primary-button">{pending ? "Saving…" : "Save backup schedule"}</button>
        </fieldset>
        {pending ? <p role="status">Saving backup destination…</p> : null}
        {error ? <p className="request-notice" role="alert">{errorMessage(error)}</p> : null}
      </form>
    </details>
  );
}
