import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[3px] border border-line-strong bg-surface text-accent-ink transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
      data-tooltip={props["aria-label"]}
      data-tooltip-align="start"
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check aria-hidden="true" className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
