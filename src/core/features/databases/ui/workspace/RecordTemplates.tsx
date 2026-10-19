import { useState } from "react";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { RequestState } from "../../../../app/ui/RequestState";
import { mutate, operationKey, errorMessage } from "../../../../client/transport";
import { useResource } from "../../../../client/useResource";
import type { FieldDto } from "../../../../client/records";

type Recurrence = { frequency: "daily" | "weekly" | "monthly" | "yearly"; time: string; weekdays?: number[]; dayOfMonth?: number; month?: number };
interface TemplateDto {
  id: string; name: string; title: string; values: Record<string, unknown>; blocks: { id: string; blockType: string; content: unknown; treePosition: string }[];
  recurrence: Recurrence | null; timezone: string | null; nextOccurrenceAt: string | null; creator: { id: string; name: string | null };
  pausedAt: string | null; pausedReason: string | null; revisionId: string;
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Default values the form can set: plain-valued fields. Other fields keep the values the template already has. */
const simple = (field: FieldDto) => ["text", "number", "checkbox", "url", "email", "phone"].includes(field.type);
function schedule(t: TemplateDto) {
  const r = t.recurrence;
  if (!r) return "Not scheduled";
  const when = r.frequency === "daily" ? "Every day" : r.frequency === "weekly" ? `Every ${r.weekdays!.map((d) => DAYS[d]).join(", ")}` : r.frequency === "monthly" ? `Monthly on day ${r.dayOfMonth}` : `Every ${MONTHS[r.month! - 1]} ${r.dayOfMonth}`;
  return `${when} at ${r.time} (${t.timezone})`;
}
const paragraphs = (text: string) => text.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line, index) => ({ id: crypto.randomUUID(), blockType: "paragraph", treePosition: String(index + 1).padStart(4, "0"), content: { text: [{ text: line }] } }));
const bodyText = (t?: TemplateDto) => (t?.blocks ?? []).map((b) => ((b.content as { text?: { text: string }[] })?.text ?? []).map((run) => run.text).join("")).join("\n");

/** DB-015: the database's record templates, each usable by hand and optionally repeating on a calendar schedule. */
export function RecordTemplates({ databaseId, fields, canEdit, onCreated }: { databaseId: string; fields: FieldDto[]; canEdit: boolean; onCreated: () => Promise<unknown> }) {
  const list = useResource<{ items: TemplateDto[] }>(`/api/databases/${databaseId}/templates`);
  const [editing, setEditing] = useState<TemplateDto | "new">();
  const [removing, setRemoving] = useState<TemplateDto>();
  const [frequency, setFrequency] = useState<string>("none");
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState<string>();
  const open = (t: TemplateDto | "new") => { setFrequency(t === "new" ? "none" : t.recurrence?.frequency ?? "none"); setEditing(t); };
  const current = editing === "new" ? undefined : editing;
  async function save(form: FormData) {
    const values: Record<string, unknown> = { ...(current?.values ?? {}) };
    for (const field of fields.filter(simple)) {
      const raw = form.get(`field-${field.id}`);
      if (field.type === "checkbox") values[field.id] = raw === "on";
      else if (raw === null || raw === "") delete values[field.id];
      else values[field.id] = field.type === "number" ? Number(raw) : String(raw);
    }
    const kind = String(form.get("frequency"));
    const recurrence = kind === "none" ? null : {
      frequency: kind, time: String(form.get("time")),
      ...(kind === "weekly" ? { weekdays: form.getAll("weekdays").map(Number) } : {}),
      ...(kind === "monthly" || kind === "yearly" ? { dayOfMonth: Number(form.get("dayOfMonth")) } : {}),
      ...(kind === "yearly" ? { month: Number(form.get("month")) } : {}),
    };
    const text = String(form.get("body"));
    await mutate(`/api/databases/${databaseId}/templates`, {
      operationKey: operationKey(), ...(current ? { id: current.id, expectedRevisionId: current.revisionId } : {}),
      name: String(form.get("name")), title: String(form.get("title")), values,
      blocks: current && text === bodyText(current) ? current.blocks : paragraphs(text), recurrence,
    });
    await list.reload();
  }
  return (
    <section className="record-templates" aria-label="Record templates">
      <div className="db-actions">
        <p className="muted">A template sets a new record's fields and body. A schedule creates a record at its time in its creator's time zone.</p>
        {canEdit ? <button className="tool tool-primary" type="button" onClick={() => open("new")}>New template</button> : null}
      </div>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <RequestState loading={list.loading} error={list.error} retry={list.reload}>
        {list.data?.items.length === 0 ? <p className="muted">No record templates yet.</p> : null}
        <ul className="record-template-list">
          {list.data?.items.map((t) => (
            <li key={t.id} className="card">
              <h3>{t.name}</h3>
              <p>{schedule(t)}</p>
              {t.pausedReason ? <p role="status" className="warning">{t.pausedReason}</p> : t.nextOccurrenceAt ? <p className="muted">Next record {new Date(t.nextOccurrenceAt).toLocaleString(undefined, { timeZone: t.timezone ?? undefined, dateStyle: "medium", timeStyle: "short" })}, created as {t.creator.name ?? "its creator"}</p> : null}
              {canEdit ? (
                <div className="db-actions">
                  <button className="tool" type="button" onClick={() => void mutate<{ value: { pageId: string } }>(`/api/databases/${databaseId}/templates/${t.id}/records`, { operationKey: operationKey() }).then(async () => { setNotice(`Created “${t.title}” from ${t.name}.`); await onCreated(); }).catch(setError)}>Use template</button>
                  <button className="tool" type="button" onClick={() => open(t)}>{t.pausedReason ? "Edit and resume" : "Edit"}</button>
                  <button className="tool" type="button" onClick={() => setRemoving(t)}>Delete</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </RequestState>
      {editing ? (
        <ActionDialog title={current ? `Edit ${current.name}` : "New record template"} action={current?.pausedReason ? "Save and resume" : "Save template"} onClose={() => setEditing(undefined)} onSubmit={save}>
          <label>Template name<input name="name" required defaultValue={current?.name} autoFocus /></label>
          <label>New record name<input name="title" required defaultValue={current?.title} /></label>
          {fields.filter(simple).map((field) => (
            field.type === "checkbox"
              ? <label key={field.id}><input type="checkbox" name={`field-${field.id}`} defaultChecked={current?.values[field.id] === true} /> {field.name}</label>
              : <label key={field.id}>{field.name}<input name={`field-${field.id}`} type={field.type === "number" ? "number" : "text"} step="any" defaultValue={current?.values[field.id] as string | number | undefined} /></label>
          ))}
          <label>Body<textarea name="body" rows={4} defaultValue={bodyText(current)} /></label>
          <label>Repeat
            <select name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)}>
              <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </label>
          {frequency === "weekly" ? <fieldset><legend>On</legend>{DAYS.map((day, index) => <label key={day}><input type="checkbox" name="weekdays" value={index} defaultChecked={current?.recurrence?.weekdays?.includes(index)} /> {day}</label>)}</fieldset> : null}
          {frequency === "yearly" ? <label>Month<select name="month" defaultValue={current?.recurrence?.month ?? 1}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label> : null}
          {frequency === "monthly" || frequency === "yearly" ? <label>Day of the month<input name="dayOfMonth" type="number" min={1} max={31} required defaultValue={current?.recurrence?.dayOfMonth ?? 1} /></label> : null}
          {frequency !== "none" ? <label>Time (your time zone)<input name="time" type="time" required defaultValue={current?.recurrence?.time ?? "09:00"} /></label> : null}
        </ActionDialog>
      ) : null}
      {removing ? (
        <ActionDialog title={`Delete ${removing.name}?`} action="Delete template" onClose={() => setRemoving(undefined)} onSubmit={async () => { await mutate(`/api/databases/${databaseId}/templates/${removing.id}/delete`, { operationKey: operationKey(), expectedRevisionId: removing.revisionId }); await list.reload(); }}>
          <p>Records already created from it stay. Its schedule stops.</p>
        </ActionDialog>
      ) : null}
    </section>
  );
}
