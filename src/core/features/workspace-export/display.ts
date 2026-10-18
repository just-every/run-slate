import type { PageProperties } from '../pages/types';

export type PageDisplay = Pick<PageProperties, 'typeface' | 'smallText' | 'fullWidth'>;

export function pageDisplay(properties: PageProperties): PageDisplay {
  // Early first-run revisions contain only the title. Omitted display fields
  // mean the schema defaults, just as they do in the page reader.
  return { typeface: properties.typeface ?? 'default', smallText: properties.smallText ?? false, fullWidth: properties.fullWidth ?? false };
}

/** Only the three stored typefaces choose CSS; no imported text becomes a style. */
export function displayStyle(display: PageDisplay): string {
  const fonts: Record<string, string> = { default: 'system-ui,sans-serif', serif: 'Georgia,serif', mono: 'ui-monospace,monospace' };
  if (!Object.hasOwn(fonts, display.typeface)) throw new Error('Unknown page display typeface.');
  return `max-width:${display.fullWidth ? 'none' : '780px'};font:${display.smallText ? 14 : 16}px/1.6 ${fonts[display.typeface]}`;
}
