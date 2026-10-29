import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useEffect, type ComponentProps } from "react";
import { cn } from "./cn";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

/** Escape also dismisses the shared, accessible-name CSS tips until the trigger leaves focus/hover. */
export function TooltipDismissal() {
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      document.querySelectorAll<HTMLElement>('.slate-app [data-tooltip]:is(:focus, :hover)').forEach(trigger => {
        trigger.dataset.tooltipDismissed = "true";
      });
    };
    const reset = (event: FocusEvent | PointerEvent) => {
      const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tooltip-dismissed]') : null;
      if (!trigger || (event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget))) return;
      if (event.type === "focusout" || !trigger.matches(":focus")) delete trigger.dataset.tooltipDismissed;
    };
    document.addEventListener("keydown", dismiss, true);
    document.addEventListener("focusout", reset, true);
    document.addEventListener("pointerout", reset, true);
    return () => {
      document.removeEventListener("keydown", dismiss, true);
      document.removeEventListener("focusout", reset, true);
      document.removeEventListener("pointerout", reset, true);
    };
  }, []);
  return null;
}

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
