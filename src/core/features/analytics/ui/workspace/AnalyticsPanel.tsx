import { useState } from "react";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
type Metrics = {
  totalViews: number;
  uniqueViewers: number;
  anonymousViews: number;
  ownPageViews: number;
  overTime: {
    day: string;
    views: number;
    ownPageViews: number;
    uniqueViewers: number;
  }[];
  viewers: {
    id: string;
    displayName: string;
    views: number;
    ownPageViews: number;
  }[];
  editors: { id: string; displayName: string }[];
};
export function AnalyticsPanel({
  pageId,
  containerId,
}: {
  pageId?: string;
  containerId?: string;
}) {
  const [range, setRange] = useState("");
  const [own, setOwn] = useState(true);
  const [metric, setMetric] = useState<"views" | "uniqueViewers">("views");
  const resource = useResource<Metrics>(
    `/api/analytics?${pageId ? `pageId=${encodeURIComponent(pageId)}` : `containerId=${encodeURIComponent(containerId ?? "")}`}${range}`,
  );
  return (
    <section className="analytics-panel" aria-label={pageId ? "Page readership" : "Space readership"}>
      <h3>Readership</h3>
      <form
        className="detail-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const query = new URLSearchParams();
          for (const key of ["from", "to"]) {
            const value = String(data.get(key) || "");
            if (value) query.set(key, `${value}T${key === "to" ? "23:59:59.999" : "00:00:00.000"}Z`);
          }
          setRange(`&${query}`);
        }}
      >
        <label>
          From
          <input name="from" type="date" />
        </label>
        <label>
          Until
          <input name="to" type="date" />
        </label>
        <button>Apply dates</button>
      </form>
      <p className="muted">Dates use UTC and include the whole Until day.</p>
      <div className="analytics-controls">
      <label>
        <input
          type="checkbox"
          checked={own}
          onChange={(event) => setOwn(event.target.checked)}
        />
        Include views by page authors
      </label>
      <label>
        Measure
        <select
          value={metric}
          onChange={(event) => setMetric(event.target.value as typeof metric)}
        >
          <option value="views">Views</option>
          <option value="uniqueViewers">Unique signed-in viewers</option>
        </select>
      </label>
      </div>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        {resource.data ? (
          <>
            <p>
              <strong>
                {metric === "views"
                  ? resource.data.totalViews -
                    (own ? 0 : resource.data.ownPageViews)
                  : resource.data.uniqueViewers}
              </strong>{" "}
              {metric === "views" ? "views" : "unique signed-in viewers"} ·{" "}
              {resource.data.anonymousViews} anonymous views
            </p>
            <p>Author views: {resource.data.ownPageViews} ({own ? "included" : "excluded"}).</p>
            {metric === "uniqueViewers" && !own ? (
              <p className="muted">
                Unique viewers include authors; this data cannot distinguish
                author-only readers.
              </p>
            ) : null}
            <table>
              <caption>Readership over time</caption>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>{metric === "views" ? "Views" : "Unique viewers"}</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.overTime.map((day) => (
                  <tr key={day.day}>
                    <td>{day.day}</td>
                    <td>
                      {metric === "views"
                        ? day.views - (own ? 0 : day.ownPageViews)
                        : day.uniqueViewers}
                      {metric === "views" ? <span className="muted"> · {day.ownPageViews} by authors{own ? "" : " (excluded)"}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h4>Readers</h4>
            <ul>
              {resource.data.viewers.map((person) => (
                <li key={person.id}>
                  {person.displayName} ·{" "}
                  {person.views - (own ? 0 : person.ownPageViews)} views{person.ownPageViews ? ` · ${person.ownPageViews} on their own pages${own ? "" : " (excluded)"}` : ""}
                </li>
              ))}
            </ul>
            <h4>Contributors</h4>
            <p>
              {resource.data.editors
                .map((person) => person.displayName)
                .join(", ") || "No recorded contributors."}
            </p>
            <p className="muted">
              Only identities you may see are listed. Draft views are not
              counted.
            </p>
          </>
        ) : null}
      </RequestState>
    </section>
  );
}
