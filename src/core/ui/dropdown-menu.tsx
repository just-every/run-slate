import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Non-modal by default: a modal Radix menu marks the rest of the app aria-hidden while its
 * focusable controls stay in the tab order (axe aria-hidden-focus). Escape, arrow keys,
 * outside-click close and focus return to the trigger behave the same.
 */
export function DropdownMenu({ modal = false, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root modal={modal} {...props} />;
}
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const itemClass =
  "relative flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-ui text-ink outline-none select-none data-[highlighted]:bg-sidebar-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted";

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        className={cn(
          "z-50 min-w-56 rounded-card border border-line bg-surface p-1 text-ink shadow-popover",
          className,
        )}
        sideOffset={sideOffset}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & { shortcut?: string }) {
  return (
    <DropdownMenuPrimitive.Item className={cn(itemClass, className)} {...props}>
      {children}
      {shortcut ? <span className="ml-auto text-tiny text-ink-faint">{shortcut}</span> : null}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem className={cn(itemClass, "pl-7", className)} {...props}>
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-3.5" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(itemClass, "pl-7", className)} {...props}>
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-3.5" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("px-2 py-1 text-micro font-medium tracking-wide text-ink-faint uppercase", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger className={cn(itemClass, className)} {...props}>
      {children}
      <ChevronRight aria-hidden="true" className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        className={cn(
          "z-50 min-w-44 rounded-card border border-line bg-surface p-1 text-ink shadow-popover",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
