import { useState } from "react";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
import type { FieldDto } from "../../../../client/records";
export function DatabaseChart({
  databaseId,
  viewId,
  fields,
}: {
  databaseId: string;
  viewId: string;
  fields: FieldDto[];
}) {
  const [group, setGroup] = useState("");
  const [numeric, setNumeric] = useState("");
  const [calculation, setCalculation] = useState("count");
  const chart = useResource<{ series: { label: string; value: number }[] }>(
    group
      ? `/api/databases/${databaseId}/views/${viewId}/chart?group=${encodeURIComponent(group)}&numeric=${encodeURIComponent(numeric)}&calculation=${calculation}`
      : null,
  );
  const max = Math.max(
    1,
    ...(chart.data?.series.map((item) => Math.abs(item.value)) ?? []),
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
          <select aria-label="Measure" value={numeric} onChange={(e) => setNumeric(e.target.value)}>
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
            value={calculation}
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
          {chart.data?.series.map((item, index) => (
            <div className="chart-row" key={index}>
              <span>{item.label}</span>
              <span
                className="chart-bar"
                style={{ width: `${(Math.abs(item.value) / max) * 100}%` }}
              />
              <strong>{item.value.toLocaleString()}</strong>
            </div>
          ))}
          <figcaption>
            Uses this saved view’s filters. Values come from the current
            permitted records.
          </figcaption>
        </figure>
      </RequestState>
    </section>
  );
}
