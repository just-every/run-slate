import type { ReactNode } from "react";
import { cn } from "../../../ui";

/**
 * The heading block every settings pane opens with. One `h2` per pane; the
 * pane's own sub-headings descend from it.
 */
export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-h3 font-semibold text-ink">{title}</h2>
          {description ? <p className="max-w-reading text-ui text-ink-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * One setting: its name and explanation on the left, its control on the right —
 * the row shape the references use throughout settings.
 */
export function SettingRow({
  label,
  description,
  control,
  controlId,
  className,
}: {
  label: string;
  description?: ReactNode;
  control: ReactNode;
  /** Given, the label points at the control. */
  controlId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line py-3 last:border-b-0",
        className,
      )}
    >
      <div className="flex min-w-0 max-w-reading flex-col gap-0.5">
        {controlId ? (
          <label className="text-ui font-medium text-ink" htmlFor={controlId}>
            {label}
          </label>
        ) : (
          <span className="text-ui font-medium text-ink">{label}</span>
        )}
        {description ? <span className="text-tiny text-ink-muted">{description}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{control}</div>
    </div>
  );
}
