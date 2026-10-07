import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Slate's theme adds its own `--text-*` scale and its own `--color-*` names, and
 * `text-<name>` is ambiguous between the two. Without this, tailwind-merge reads
 * `text-ui` and `text-ink` as the same class group and silently drops one of
 * them. Both scales are declared here so a size and a colour survive together.
 */
const fontSizes = ["micro", "tiny", "small", "ui", "body", "h3", "h2", "h1", "title"] as const;

const colors = [
  "canvas",
  "surface",
  "sidebar",
  "sidebar-hover",
  "overlay",
  "ink",
  "ink-muted",
  "ink-faint",
  "ink-inverse",
  "line",
  "line-strong",
  "accent",
  "accent-hover",
  "accent-soft",
  "accent-ink",
  "danger",
  "danger-soft",
  "warn",
  "warn-soft",
  "good",
  "good-soft",
  "draft",
  "draft-soft",
  "hl-yellow",
  "hl-blue",
  "hl-green",
  "hl-red",
  "hl-purple",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...fontSizes] }],
      "text-color": [{ text: [...colors] }],
    },
  },
});

/** Join conditional class names and let the later Tailwind utility win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
