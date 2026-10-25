import { shortDate } from "../../../app/ui/displayDate";
import {LearnedMethod} from "./LearnedMethod";
import { TrialProgress } from "./TrialProgress";
import { useState } from "react";
import { mutate, operationKey } from "../../../client/transport";
import { ActionDialog } from "../../../app/ui/ActionDialog";
export interface Trial {
  id: string;
  state: string;
  revision_id: string;
  plan_json: string;
  outcome_json: string | null;
}
interface Plan {
  eligibility: string;
  assignment: { subjectId: string; arm: string }[];
  assignmentMethod: string;
  confounding: string[];
  baseline: string;
  metric: string;
  meaningfulEffect: number;
  maximumHalfWidth: number;
  startsAt: string;
  endsAt: string;
  supportGuardrail: number;
  contactLimit: number;
  maximumCostMicros: number;
  forecast: string;
  instrumentationRevision: string;
}
export function TrialPanel({
  trial,
  reload,
}: {
  trial: Trial;
  reload: () => void;
}) {
  const plan = JSON.parse(trial.plan_json) as Plan;
  const outcome = trial.outcome_json
    ? (JSON.parse(trial.outcome_json) as {
        classification: string;
        reason?: string;
        reasons?: string[];
        estimate?: {
          effect: number;
          lower: number;
          upper: number;
          halfWidth: number;
          confidence: number;
        };
        disconfirms?: boolean;
      })
    : null;
  const [approve, setApprove] = useState(false);
  return (
    <section className="trial-panel">
      <p className="eyebrow">
        {trial.state === "prepared"
          ? "PREPARED TRIAL"
          : trial.state === "active"
            ? "TRIAL IN PROGRESS"
            : "TRIAL OUTCOME"}
      </p>
      <h2>
        {outcome
          ? outcome.classification.replaceAll("-", " ")
          : trial.state === "prepared"
            ? "A smaller step. A clearer answer."
            : plan.metric}
      </h2>
      <p>
        {trial.state === "prepared"
          ? "Not running yet. The declared treatment effects need authority."
          : `Status: ${trial.state}`}
      </p>
      <p>{plan.forecast}</p>
      <dl className="trial-bounds">
        <div>
          <dt>Participants</dt>
          <dd>{plan.assignment.length}</dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>
            {shortDate(plan.startsAt)} –{" "}
            {shortDate(plan.endsAt)}
          </dd>
        </div>
        <div>
          <dt>Contact limit</dt>
          <dd>{plan.contactLimit}</dd>
        </div>
        <div>
          <dt>Support guardrail</dt>
          <dd>{plan.supportGuardrail}</dd>
        </div>
        <div>
          <dt>Maximum reserved cost</dt>
          <dd>${(plan.maximumCostMicros / 1_000_000).toFixed(2)}</dd>
        </div>
      </dl>
      <p className="muted">Reserved cost is a limit, not confirmed spending.</p>
      <details>
        <summary>What would change our mind?</summary>
        <p>
          <strong>Eligibility:</strong> {plan.eligibility}
        </p>
        <p>
          <strong>Baseline:</strong> {plan.baseline}
        </p>
        <p>
          <strong>Metric:</strong> {plan.metric}
        </p>
        <p>
          Meaningful effect: {plan.meaningfulEffect}. Maximum uncertainty
          half-width: {plan.maximumHalfWidth}.
        </p>
        <p>Assignment: {plan.assignmentMethod}</p>
        {plan.confounding.length ? (
          <ul>
            {plan.confounding.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        ) : null}
      </details>
      {outcome ? (
        <div className="finding">
          <h3>What we learned</h3>
          {outcome.reason ? <p>{outcome.reason}</p> : null}
          {outcome.reasons?.map((reason, i) => (
            <p key={i}>{reason}</p>
          ))}
          {outcome.estimate ? (
            <p>
              Estimated effect {outcome.estimate.effect.toLocaleString()} ·{" "}
              {(outcome.estimate.confidence * 100).toFixed(0)}% interval{" "}
              {outcome.estimate.lower.toLocaleString()} to{" "}
              {outcome.estimate.upper.toLocaleString()}. Uncertainty half-width:{" "}
              {outcome.estimate.halfWidth.toLocaleString()}.
            </p>
          ) : null}
          {outcome.classification === "null" ? (
            <p>
              This result rules out the predeclared meaningful benefit at the
              declared precision.
            </p>
          ) : null}
          {outcome.classification === "adverse" ? (
            <p>
              Further trial effects must stay stopped. Any recovery needs its
              own supported authority.
            </p>
          ) : null}
          {outcome.classification === "inconclusive" ? (
            <p>
              This does not establish an effect. Improve precision or exposure
              before drawing a causal conclusion.
            </p>
          ) : null}
          <p>The outcome is retained with its method revision.</p>
          {trial.state === "completed" ? <LearnedMethod id={trial.id} revisionId={trial.revision_id}/> : null}
        </div>
      ) : null}
      {trial.state === "prepared" ? (
        <button className="primary-button" onClick={() => setApprove(true)}>
          Review & approve bounded trial
        </button>
      ) : null}
      {trial.state !== "prepared" ? (
        <TrialProgress id={trial.id} reload={reload} />
      ) : null}
      {approve ? (
        <ActionDialog
          title="Approve this bounded trial?"
          action="Approve trial"
          onClose={() => setApprove(false)}
          onSubmit={async () => {
            await mutate(`/api/experiments/${trial.id}/approve`, {
              operationKey: operationKey(),
              expectedRevisionId: trial.revision_id,
            });
            reload();
          }}
        >
          <p>
            Approval applies only to the declared participants, window, contact
            limit, support guardrail and cost ceiling shown here. It is not
            authority for unrelated publication or customer actions.
          </p>
          <p>{plan.eligibility}</p>
          <p>
            {plan.assignment.length} participants · contact limit{" "}
            {plan.contactLimit} · maximum reserved $
            {(plan.maximumCostMicros / 1_000_000).toFixed(2)}
          </p>
        </ActionDialog>
      ) : null}
    </section>
  );
}
