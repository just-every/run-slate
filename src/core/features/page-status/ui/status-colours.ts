import type { StatusColourKey } from "./types";

/**
 * The five stored label colours of the design system. A status is never conveyed by its
 * colour alone: every swatch is accompanied by the entry's own label or an accessible
 * name, so the colour only reinforces what the text already says.
 */
export const statusColourClass: Record<StatusColourKey, string> = {
  yellow: "bg-hl-yellow",
  blue: "bg-hl-blue",
  green: "bg-hl-green",
  red: "bg-hl-red",
  purple: "bg-hl-purple",
};

export const statusColourName: Record<StatusColourKey, string> = {
  yellow: "Yellow",
  blue: "Blue",
  green: "Green",
  red: "Red",
  purple: "Purple",
};
