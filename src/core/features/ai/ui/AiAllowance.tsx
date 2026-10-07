import { useState } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
interface Availability {
  enabled: boolean;
  providerConfigured: boolean;
  modelPolicyConfigured: boolean;
  localProvider: boolean;
  accountingUnit: "tokens" | "usd-micros";
  monthlyTokenAllowance: number | null;
  perRunTokenAllowance: number | null;
}
export function AiAllowance() {
  const availability = useResource<Availability>("/api/ai/availability"),
    member = useResource<{ role: string }>("/api/members/current");
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const state = availability.data;
  if (!state)
    return availability.error ? (
      <p role="alert">{errorMessage(availability.error)}</p>
    ) : null;
  const configured = state.enabled && state.modelPolicyConfigured;
  if (configured && (!state.localProvider || member.data?.role !== "owner")) return null;
  return (
    <details className="finding" open={!configured}>
      <summary>AI allowance</summary>
      <h3>
        {configured ? "Local inference allowance" : state.providerConfigured
          ? "An owner allowance is needed"
          : "Connect an inference provider"}
      </h3>
      {!state.providerConfigured ? (
        <p>
          The workspace has no connected inference provider. An owner needs to
          connect its provider account before Slate can answer. Your page and
          question remain here.
        </p>
      ) : member.data?.role !== "owner" ? (
        <p>A workspace owner needs to set the allowance for this work.</p>
      ) : state.localProvider ? (
        <form
          className="detail-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPending(true);
            setError(undefined);
            try {
              await mutate("/api/ai/local-allowance", {
                operationKey: operationKey(),
                monthlyTokenAllowance: Number(data.get("monthly")),
                perRunTokenAllowance: Number(data.get("perRun")),
                acknowledgeProviderHasNoHardTokenCap: true,
              });
              availability.reload();
            } catch (cause) {
              setError(cause);
            } finally {
              setPending(false);
            }
          }}
        >
          <p>
            This development provider counts tokens. Monetary cost is unknown,
            and the provider does not enforce a hard token cap.
          </p>
          <label>
            Monthly token allowance
            <input
              name="monthly"
              type="number"
              min="1"
              step="1"
              required
              defaultValue={state.monthlyTokenAllowance ?? ""}
            />
          </label>
          <label>
            Token allowance for one run
            <input
              name="perRun"
              type="number"
              min="1"
              step="1"
              required
              defaultValue={state.perRunTokenAllowance ?? ""}
            />
          </label>
          <label>
            <input type="checkbox" required />I understand this is a local
            accounting allowance, not a provider-enforced spending cap.
          </label>
          <button disabled={pending}>
            {pending ? "Saving allowance…" : "Set allowance"}
          </button>
        </form>
      ) : (
        <p>
          The connected provider needs an owner-approved metered allowance
          before it can run. No work has been charged by this request.
        </p>
      )}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </details>
  );
}
