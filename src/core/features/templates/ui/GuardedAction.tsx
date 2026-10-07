import { useId, type ReactNode } from "react";
import { Button, cn, type ButtonProps } from "../../../ui";

/**
 * An action that a rule may refuse. A refused action stays on screen as a
 * disabled control carrying the reason in words — never hidden, and never
 * conveyed by styling alone.
 */
export function GuardedAction({
  label,
  reason,
  onClick,
  icon,
  variant = "secondary",
  size = "sm",
  align = "start",
  className,
}: {
  label: string;
  /** Non-null disables the control and states why. */
  reason?: string | null;
  onClick?: () => void;
  icon?: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  align?: "start" | "end";
  className?: string;
}) {
  const reasonId = useId();
  const refused = typeof reason === "string" && reason.length > 0;

  return (
    <span className={cn("inline-flex flex-col gap-1", align === "end" ? "items-end" : "items-start", className)}>
      <Button
        aria-describedby={refused ? reasonId : undefined}
        disabled={refused}
        onClick={refused ? undefined : onClick}
        size={size}
        variant={variant}
      >
        {icon}
        {label}
      </Button>
      {refused ? (
        <span
          className={cn("max-w-xs text-tiny text-ink-muted", align === "end" && "text-right")}
          id={reasonId}
        >
          {reason}
        </span>
      ) : null}
    </span>
  );
}
