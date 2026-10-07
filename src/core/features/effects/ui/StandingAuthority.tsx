import { useState } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RequestState } from "../../../app/ui/RequestState";
interface Grant {
  id: string;
  kind: string;
  scope_json: string;
  expires_at: string;
  revoked_at: string | null;
}
export function StandingAuthority() {
  const member = useResource<{ role: string }>("/api/members/current");
  return member.data?.role === "owner" ? <AuthorityList /> : null;
}
function AuthorityList() {
  const resource = useResource<{ items: Grant[] }>("/api/effects/grants");
  return (
    <details>
      <summary>Standing authority</summary>
      <p>
        Revoke permission for future work here. Confirmed work and receipts
        remain; reversal requires separate authority.
      </p>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        {resource.data?.items.map((grant) => (
          <GrantCard key={grant.id} grant={grant} reload={resource.reload} />
        ))}
        {resource.data?.items.length === 0 ? (
          <p>No standing grants are recorded.</p>
        ) : null}
      </RequestState>
    </details>
  );
}
function GrantCard({ grant, reload }: { grant: Grant; reload: () => void }) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const scope = JSON.parse(grant.scope_json) as {
    operations: string[];
    targets: string[];
    audience: string[];
    maxCostMicros: number;
  };
  return (
    <article className="finding">
      <h4>
        {grant.kind === "skill"
          ? "Procedure refinement"
          : grant.kind === "trial"
            ? "Bounded trial"
            : grant.kind === "continuation"
              ? "Continued work"
              : "Scoped action"}
      </h4>
      <p>
        {grant.revoked_at
          ? "Revoked"
          : `Expires ${new Date(grant.expires_at).toLocaleString()}`}
      </p>
      <details>
        <summary>Exact allowed scope</summary>
        <ul>
          {scope.operations.map((operation) => (
            <li key={operation}>{operation}</li>
          ))}
        </ul>
        <p>
          {scope.targets.length} target{scope.targets.length === 1 ? "" : "s"} ·{" "}
          {scope.audience.length} audience entr
          {scope.audience.length === 1 ? "y" : "ies"}
        </p>
        <pre>{JSON.stringify(scope, null, 2)}</pre>
      </details>
      {!grant.revoked_at ? (
        <button
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(undefined);
            try {
              await mutate(
                `/api/effects/grants/${encodeURIComponent(grant.id)}/revoke`,
                { operationKey: operationKey() },
              );
              reload();
            } catch (cause) {
              setError(cause);
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? "Revoking…" : "Revoke future authority"}
        </button>
      ) : null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </article>
  );
}
