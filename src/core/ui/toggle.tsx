import * as TogglePrimitive from "@radix-ui/react-toggle";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Toggle({ className, ...props }: ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      className={cn(
        "max-[700px]:min-h-11 max-[700px]:min-w-11 inline-flex h-7 items-center justify-center gap-1.5 rounded-control px-2 text-ui text-ink-muted transition-colors hover:bg-sidebar-hover hover:text-ink data-[state=on]:bg-sidebar-hover data-[state=on]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The switch shape the references use for a setting that is on or off —
 * indexing (`WEB-005`), a container's external-access switches (`CONT-007`).
 */
export function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
  ...props
}: Omit<ComponentProps<"button">, "onChange"> & {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        "inline-flex h-4.5 w-8 shrink-0 items-center rounded-full border border-transparent px-0.5 transition-colors disabled:opacity-50",
        checked ? "bg-accent" : "bg-line-strong",
        className,
      )}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5 rounded-full bg-canvas transition-transform",
          checked ? "translate-x-3.5" : "translate-x-0",
        )}
      />
    </button>
  );
}
