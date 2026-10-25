import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "./cn";
import { DialogOverlay } from "./dialog";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const sheetVariants = cva("fixed z-50 flex flex-col border-line bg-surface text-ink shadow-[0_16px_48px_rgb(15_15_15/0.16)]", {
  variants: {
    side: {
      right: "inset-y-0 right-0 w-[min(22rem,100vw)] border-l",
      left: "inset-y-0 left-0 w-[min(20rem,100vw)] border-r",
      bottom: "inset-x-0 bottom-0 max-h-[85vh] rounded-t-card border-t",
    },
  },
  defaultVariants: { side: "right" },
});

export function SheetContent({
  className,
  children,
  side,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & VariantProps<typeof sheetVariants>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="max-[700px]:min-h-11 max-[700px]:min-w-11 absolute top-3 right-3 rounded-control p-1 text-ink-faint transition-colors hover:bg-sidebar-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X aria-hidden="true" className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-2 border-b border-line px-3 py-2.5", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-ui font-semibold text-ink", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-tiny text-ink-muted", className)} {...props} />;
}
