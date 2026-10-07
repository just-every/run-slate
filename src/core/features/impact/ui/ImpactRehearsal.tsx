import { useState } from "react";
import { mutate, errorMessage } from "../../../client/transport";
interface Ref {
  kind: "page" | "source";
  sourceId: string;
  revisionId: string;
}
interface Impact {
  simulated: boolean;
  liveWrites: boolean;
  items: {
    dependencyId: string;
    targetKind: string;
    pageId: string;
    requiresAuthority: boolean;
  }[];
}
export function ImpactRehearsal({
  source,
  newRevisionId,
}: {
  source: Ref;
  newRevisionId: string;
}) {
  const [impact, setImpact] = useState<Impact>(),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <section>
      <button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(undefined);
          try {
            setImpact(
              await mutate<Impact>("/api/impact/rehearse", {
                source,
                newRevisionId,
              }),
            );
          } catch (cause) {
            setError(cause);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Checking dependencies…" : "Rehearse the impact"}
      </button>
      {impact ? (
        <div className="finding">
          <h4>Impact preview</h4>
          <p>No live changes or publication were made.</p>
          {impact.items.length ? (
            <ul>
              {impact.items.map((item) => (
                <li key={item.dependencyId}>
                  <a href={`/app/pages/${encodeURIComponent(item.pageId)}`}>
                    {item.targetKind.replaceAll("-", " ")}
                  </a>
                  {item.requiresAuthority
                    ? " · Decision owner must review"
                    : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>No currently readable dependencies were found.</p>
          )}
        </div>
      ) : null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </section>
  );
}
