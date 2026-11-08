import { useEffect, useRef, useState } from "react";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
import type { FieldDto } from "../../../../client/records";
export function DatabaseChart({
  databaseId,
  viewId,
  viewRevisionId,
  fields,
}: {
  databaseId: string;
  viewId: string;
  viewRevisionId: string;
  fields: FieldDto[];
}) {
  const [group, setGroup] = useState(() => fields.find(field=>["select","status"].includes(field.type))?.id ?? fields[0]?.id ?? "");
  const [numeric, setNumeric] = useState("");
  const [calculation, setCalculation] = useState("count");
  const chart = useResource<{ viewId: string; viewName: string; series: { label: unknown; value: number | null }[] }>(
    group
      ? `/api/databases/${databaseId}/views/${viewId}/chart?group=${encodeURIComponent(group)}&numeric=${encodeURIComponent(numeric)}&calculation=${numeric ? calculation : "count"}`
      : null,
  );
  const revision = useRef(viewRevisionId);
  useEffect(() => {
    if (revision.current !== viewRevisionId) {
      revision.current = viewRevisionId;
      void chart.reload();
    }
  }, [viewRevisionId, chart.reload]);
  const max = Math.max(
    1,
    ...(chart.data?.series.map((item) => Math.abs(item.value ?? 0)) ?? []),
  );
  return (
    <section>
      <h2>Chart this view</h2>
      <div className="chart-controls">
        <label>
          Group
          <select aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Choose field</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Measure
          <select aria-label="Measure" value={numeric} onChange={(e) => { setNumeric(e.target.value); if (!e.target.value) setCalculation("count"); }}>
            <option value="">Record count</option>
            {fields
              .filter((field) =>
                ["number", "formula", "rollup"].includes(field.type),
              )
              .map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Calculation
          <select
            aria-label="Calculation"
            value={numeric ? calculation : "count"}
            disabled={!numeric}
            onChange={(e) => setCalculation(e.target.value)}
          >
            {["count", "sum", "average", "minimum", "maximum"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <RequestState
        loading={chart.loading}
        error={chart.error}
        retry={chart.reload}
      >
        <figure aria-label="Chart of the current filtered view">
          {chart.data?.series.length === 0 ? <p>No records match this view.</p> : null}
          {chart.data?.series.map((item, index) => (
            <div className="chart-row" key={index}>
              <span>{Array.isArray(item.label) ? item.label.join(", ") : item.label == null ? "No value" : String(item.label)}</span>
              <span
                className="chart-bar"
                style={{ width: `${(Math.abs(item.value ?? 0) / max) * 100}%` }}
              />
              <strong>{item.value == null ? "No value" : item.value.toLocaleString()}</strong>
            </div>
          ))}
          <figcaption>
            Source view: <strong>{chart.data?.viewName}</strong>. Uses this saved view’s filters. Values come from the current
            permitted records.
          </figcaption>
        </figure>
      </RequestState>
    </section>
  );
}
