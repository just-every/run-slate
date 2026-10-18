import type { PageProperties } from '../pages/types';

export type PageDisplay = Pick<PageProperties, 'typeface' | 'smallText' | 'fullWidth'>;

export function pageDisplay(properties: PageProperties): PageDisplay {
  return { typeface: properties.typeface, smallText: properties.smallText, fullWidth: properties.fullWidth };
}

/** Only the three stored typefaces choose CSS; no imported text becomes a style. */
export function displayStyle(display: PageDisplay): string {
  const fonts: Record<string, string> = { default: 'system-ui,sans-serif', serif: 'Georgia,serif', mono: 'ui-monospace,monospace' };
  if (!Object.hasOwn(fonts, display.typeface)) throw new Error('Unknown page display typeface.');
  return `max-width:${display.fullWidth ? 'none' : '780px'};font:${display.smallText ? 14 : 16}px/1.6 ${fonts[display.typeface]}`;
}
