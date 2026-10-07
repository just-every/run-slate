import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../ui";

/** One row of the publish panel: an icon, a label, an optional line, a control. */
export function SettingRow({
  icon: Icon,
  label,
  labelId,
  description,
  control,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  labelId?: string;
  description?: string | null;
  control?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2 px-1 py-1.5", className)}>
      {Icon ? <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ui text-ink" id={labelId}>
          {label}
        </span>
        {description ? <span className="text-tiny text-ink-muted">{description}</span> : null}
      </div>
      {control ? <div className="flex shrink-0 items-center gap-1 pt-0.5">{control}</div> : null}
    </div>
  );
}
