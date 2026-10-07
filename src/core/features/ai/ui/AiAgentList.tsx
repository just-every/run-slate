import { Bot, Info, Plus } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import {
  Badge,
  Button,
  cn,
  DeniedState,
  EmptyState,
  ErrorState,
  LoadingState,
  type SurfaceState,
} from "../../../ui";
import { sentenceCase, type AiAgent } from "./types";

/**
 * `AI-014` — an agent is four things and no more: a name, instructions, a source
 * scope and an owner. Each row shows all four, and the two facts that bound what
 * an agent can do are stated on every row rather than once at the top: it runs
 * under the access of whoever invoked it, and what it writes is a proposal.
 *
 * The clause also says what 1.0 does not carry — model choice, per-agent budgets,
 * per-destination write levels. There are no controls for those, and rather than
 * leave a reader hunting for them, the panel says so once, plainly, where they
 * would have been.
 */
export interface AiAgentListProps {
  state: SurfaceState;
  agents: readonly AiAgent[];
  onOpen: (agentId: string) => void;
  onRun?: (agentId: string) => void;
  onCreate?: () => void;
  errorDetail?: string;
  onRetry?: () => void;
  onRequestAccess?: () => void;
  className?: string;
}

export function AiAgentList({
  state,
  agents,
  onOpen,
  onRun,
  onCreate,
  errorDetail,
  onRetry,
  onRequestAccess,
  className,
}: AiAgentListProps) {
  const member = knowledgeNoun("member");

  return (
    <section aria-labelledby="ai-agents-heading" className={cn("flex w-full max-w-wide flex-col gap-3", className)}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-h3 font-semibold text-ink" id="ai-agents-heading">
          Agents
        </h2>
        {onCreate ? (
          <Button className="ml-auto" onClick={onCreate} size="sm">
            <Plus aria-hidden="true" className="size-3.5" />
            New agent
          </Button>
        ) : null}
      </header>

      {state === "loading" ? <LoadingState rows={3} /> : null}
      {state === "error" ? (
        <ErrorState detail={errorDetail} onRetry={onRetry} title="The agents could not be loaded" />
      ) : null}
      {state === "denied" ? <DeniedState onRequestAccess={onRequestAccess} /> : null}
      {state === "empty" ? (
        <EmptyState
          action={
            onCreate ? (
              <Button onClick={onCreate} size="sm">
                New agent
              </Button>
            ) : undefined
          }
          description={`An agent carries instructions, a source scope and an owner. It runs under the access of the ${member} who invokes it.`}
          title="No agents yet"
        />
      ) : null}

      {state === "ready" ? (
        <ul className="flex flex-col gap-2">
          {agents.map((agent) => (
            <li className="rounded-card border border-line bg-surface p-3" key={agent.id}>
              <div className="flex flex-wrap items-start gap-2">
                <Bot aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                <div className="min-w-0 flex-1">
                  <button
                    aria-label={`Open the agent ${agent.name}`}
                    className="text-ui font-medium text-ink underline-offset-4 hover:underline"
                    onClick={() => onOpen(agent.id)}
                    type="button"
                  >
                    {agent.name}
                  </button>
                  <p className="mt-0.5 line-clamp-2 text-tiny text-ink-muted">{agent.instructions}</p>
                  <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-micro text-ink-faint">
                    <div className="flex gap-1">
                      <dt>Source scope</dt>
                      <dd className="text-ink-muted">{agent.sourceScopeLabel}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Owner</dt>
                      <dd className="text-ink-muted">{agent.owner.name}</dd>
                    </div>
                    {agent.lastRunAtLabel ? (
                      <div className="flex gap-1">
                        <dt>Last run</dt>
                        <dd className="text-ink-muted">{agent.lastRunAtLabel}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge tone="outline">Runs under the invoking {member}&apos;s access</Badge>
                    <Badge tone="outline">Writes are proposals</Badge>
                  </div>
                </div>
                {onRun ? (
                  <Button onClick={() => onRun(agent.id)} size="sm" variant="secondary">
                    Run
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="flex items-start gap-1.5 rounded-card border border-line bg-sidebar p-2.5 text-tiny text-ink-muted">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        <span>
          This release carries the agent itself and nothing beyond it. There is no per-agent model choice, no per-agent
          budget and no per-destination write level: every agent uses the workspace&apos;s configured provider and model,
          spends against the one monthly budget, and writes only proposals a {member} accepts.{" "}
          {sentenceCase(member)}s looking for those controls will not find them here.
        </span>
      </p>
    </section>
  );
}
