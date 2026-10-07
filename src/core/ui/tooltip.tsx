import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn(
          "z-50 rounded-control bg-ink px-2 py-1 text-tiny text-canvas shadow-[0_8px_20px_rgb(15_15_15/0.2)]",
          className,
        )}
        sideOffset={sideOffset}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
