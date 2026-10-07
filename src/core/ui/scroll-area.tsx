import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export function ScrollArea({ className, children, ...props }: ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root className={cn("relative overflow-hidden", className)} {...props}>
      <ScrollAreaPrimitive.Viewport className="size-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        className="flex w-2 touch-none p-0.5 transition-colors select-none"
        orientation="vertical"
      >
        <ScrollAreaPrimitive.Thumb className="flex-1 rounded-full bg-line-strong" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
