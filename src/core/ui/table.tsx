import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    // tabIndex keeps a sideways-scrolling table reachable from the keyboard
    // (WCAG 2.1 AA; axe's scrollable-region-focusable).
    <div className="w-full overflow-x-auto" tabIndex={0}>
      <table className={cn("w-full border-collapse text-ui", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("border-b border-line", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={className} {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return <tfoot className={cn("border-t border-line text-tiny text-ink-muted", className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line last:border-b-0 hover:bg-sidebar/60", className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn("h-8 px-2 text-left text-tiny font-medium whitespace-nowrap text-ink-muted", className)}
      scope="col"
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("h-9 px-2 align-middle text-ui text-ink", className)} {...props} />;
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return <caption className={cn("mt-2 text-left text-tiny text-ink-muted", className)} {...props} />;
}
