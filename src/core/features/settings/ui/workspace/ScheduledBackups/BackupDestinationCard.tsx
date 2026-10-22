import type { BackupDestination, BackupDrill } from "../ScheduledBackups";
import { weekdays } from "./BackupDestinationForm";

function BackupTime({ value }: { value: string | null }) {
  return value ? <time dateTime={value}>{new Date(value).toUTCString()}</time> : <>None recorded</>;
}

export function BackupDestinationCard({ destination, drill, disabled, onAction }: {
  destination: BackupDestination;
  drill?: BackupDrill;
  disabled: boolean;
  onAction: (action: "test" | "run" | "drill" | "remove") => void;
}) {
  const report = drill?.report ?? destination.drillReport;
  const facts = [
    ["Provider", destination.kind === "r2" ? "Cloudflare R2" : "S3-compatible"],
    ["Endpoint", destination.endpoint],
    ["Region", destination.region],
    ["Bucket", destination.bucket],
    ["Key prefix", destination.prefix || "Bucket root"],
    ["Schedule", `${destination.schedule === "weekly" ? `Weekly on ${weekdays[destination.weekday]}` : "Nightly"} at ${destination.time} UTC`],
    ["Retention", `${destination.retention} successful backups`],
  ];
  return (
    <section className="workspace-transfer-panel" aria-label={`Backup destination ${destination.name}`}>
      <h4>{destination.name}</h4>
      <dl className="settings-facts">
        {facts.map(([label, value]) => <div key={label} style={{ flexWrap: "wrap" }}>
          <dt>{label}</dt><dd style={{ minWidth: 0 }}>{value}</dd>
        </div>)}
        <div style={{ flexWrap: "wrap" }}><dt>Last successful backup</dt><dd style={{ minWidth: 0 }}><BackupTime value={destination.lastSuccess} /></dd></div>
        <div style={{ flexWrap: "wrap" }}><dt>Last failed backup</dt><dd style={{ minWidth: 0 }}><BackupTime value={destination.lastFailure} /></dd></div>
        {destination.lastFailureCode ? <div style={{ flexWrap: "wrap" }}><dt>Failure code</dt><dd style={{ minWidth: 0 }}>{destination.lastFailureCode}</dd></div> : null}
      </dl>
      <nav className="action-row" aria-label={`Backup actions for ${destination.name}`}>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => onAction("test")}>Test connection</button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => onAction("run")}>Run now</button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => onAction("drill")}>Run restore drill</button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => onAction("remove")}>Remove</button>
      </nav>
      {report ? <section aria-label={`Restore drill report for ${destination.name}`}>
        <h4>Restore drill · {report.state}</h4>
        <p>{report.message}</p>
        {report.checkedAt ? <p>Checked: <BackupTime value={report.checkedAt} /></p> : null}
        <p className="muted">This is an archive validation report. A successful validation does not confirm a completed restore into another deployment. Follow the instructions and verify that deployment separately.</p>
        {drill ? <>
          <ol>{drill.instructions.map((instruction, index) => <li key={index}>{instruction}</li>)}</ol>
          <a className="transfer-action" href={drill.downloadPath}>Download restore drill archive</a>
        </> : <p>Run a restore drill to obtain its archive and instructions.</p>}
      </section> : null}
    </section>
  );
}
