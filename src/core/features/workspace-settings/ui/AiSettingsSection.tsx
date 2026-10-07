import { useId } from "react";
import { Badge, Button, Input, Switch, cn } from "../../../ui";
import { AiUsageTables } from "./AiUsageTables";
import { SettingsSection } from "./SettingsSection";
import type { AiSettingsState } from "./types";

/**
 * `AI-001`, `AI-010`, `AI-012`.
 *
 * AI is off until a provider is configured and a workspace owner turns it on,
 * and it cannot be turned on without a monthly budget greater than zero. While
 * it is off, no run starts and no request reaches a provider — this pane says
 * exactly that rather than implying AI is merely idle.
 */
export function AiSettingsSection({
  settings,
  onBudgetChange,
  onEnabledChange,
  onConfigureProvider,
  canAdminister,
  saving = false,
  className,
}: {
  settings: AiSettingsState;
  onBudgetChange: (next: string) => void;
  onEnabledChange: (next: boolean) => void;
  /** Opens the provider adapter's own configuration. */
  onConfigureProvider?: () => void;
  canAdminister: boolean;
  saving?: boolean;
  className?: string;
}) {
  const fieldId = useId();
  const budgetAmount = Number.parseFloat(settings.monthlyBudget);
  const budgetIsPositive = Number.isFinite(budgetAmount) && budgetAmount > 0;

  const refusal = !canAdminister
    ? "Only a workspace owner turns AI on."
    : !settings.providerConfigured
      ? "Configure an AI provider first."
      : !budgetIsPositive
        ? "Set a monthly budget greater than zero first."
        : null;

  return (
    <SettingsSection
      className={className}
      description="Slate reserves the maximum estimated cost of a run against this calendar month before the run is queued, and releases the unused part when the run settles."
      title="AI"
    >
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 rounded-card border p-3",
          settings.enabled ? "border-line bg-sidebar" : "border-line-strong bg-canvas",
        )}
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-ui font-medium text-ink">
            {settings.enabled ? "AI is on" : "AI is off"}
            <Badge tone={settings.enabled ? "good" : "neutral"}>
              {settings.enabled ? "Runs may start" : "No run can start"}
            </Badge>
          </p>
          <p className="mt-0.5 max-w-reading text-ui text-ink-muted">
            {settings.providerConfigured
              ? settings.enabled
                ? `Runs go to ${settings.providerName ?? "the configured provider"}. Turning AI off stops every new run at once.`
                : "No run can be started and no request reaches a provider while AI is off."
              : "No AI provider is configured. Until one is, AI cannot be turned on and no request reaches a provider."}
          </p>
          {settings.providerConfigured ? null : onConfigureProvider ? (
            <Button className="mt-2" disabled={!canAdminister} onClick={onConfigureProvider} size="sm" variant="secondary">
              Configure a provider
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Switch
            aria-describedby={refusal ? `${fieldId}-refusal` : undefined}
            aria-label={settings.enabled ? "AI is on" : "AI is off"}
            checked={settings.enabled}
            disabled={refusal !== null || saving}
            onCheckedChange={onEnabledChange}
          />
          {refusal ? (
            <span className="max-w-56 text-right text-tiny text-ink-muted" id={`${fieldId}-refusal`}>
              {refusal}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-tiny font-medium text-ink-muted" htmlFor={`${fieldId}-budget`}>
          Monthly budget
        </label>
        <Input
          aria-describedby={`${fieldId}-budget-note`}
          className="w-40"
          disabled={!canAdminister || saving}
          id={`${fieldId}-budget`}
          inputMode="decimal"
          onChange={(event) => onBudgetChange(event.target.value)}
          value={settings.monthlyBudget}
        />
        <p className="text-tiny text-ink-muted" id={`${fieldId}-budget-note`}>
          {budgetIsPositive
            ? "A run that would exceed this month's budget is refused before any provider request."
            : "A budget greater than zero is required before AI can be turned on."}
        </p>
      </div>

      {settings.spentThisMonth !== null || settings.reservedThisMonth !== null ? (
        <dl className="flex flex-wrap gap-3">
          {settings.spentThisMonth !== null ? (
            <div className="rounded-card border border-line px-3 py-2">
              <dt className="text-micro tracking-wide text-ink-faint uppercase">Spent this month</dt>
              <dd className="text-ui font-medium text-ink tabular-nums">{settings.spentThisMonth}</dd>
            </div>
          ) : null}
          {settings.reservedThisMonth !== null ? (
            <div className="rounded-card border border-line px-3 py-2">
              <dt className="text-micro tracking-wide text-ink-faint uppercase">Held by unfinished runs</dt>
              <dd className="text-ui font-medium text-ink tabular-nums">{settings.reservedThisMonth}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <AiUsageTables byDay={settings.usageByDay} byFeature={settings.usageByFeature} />
    </SettingsSection>
  );
}
