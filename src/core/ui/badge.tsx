import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-micro font-medium leading-4",
  {
    variants: {
      tone: {
        neutral: "bg-sidebar-hover text-ink-muted",
        accent: "bg-accent-soft text-accent",
        good: "bg-good-soft text-good",
        warn: "bg-warn-soft text-warn",
        danger: "bg-danger-soft text-danger",
        draft: "bg-draft-soft text-draft",
        outline: "border border-line-strong text-ink-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
