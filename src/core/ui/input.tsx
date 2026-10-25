import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const field =
  "max-[700px]:min-h-11 w-full rounded-control border border-line-strong bg-surface px-2.5 text-ui text-ink placeholder:text-ink-faint outline-none transition-colors focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-8", className)} type={type} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-16 py-2 leading-normal", className)} {...props} />;
}
