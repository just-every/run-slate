import type { TableOfContentsSettings } from '../editor/table-of-contents';
import type { ImportedStatusColour } from './types';

export function statusColour(value: string | undefined): ImportedStatusColour | undefined {
  return ['grey', 'blue', 'green', 'yellow', 'red', 'purple'].includes(value ?? '') ? value as ImportedStatusColour : undefined;
}

export function tableOfContentsSettings(value: unknown): TableOfContentsSettings | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const settings = value as Record<string, unknown>;
  if (!Number.isInteger(settings.minLevel) || !Number.isInteger(settings.maxLevel)) return undefined;
  const minLevel = settings.minLevel as number, maxLevel = settings.maxLevel as number;
  if (minLevel < 1 || maxLevel > 3 || minLevel > maxLevel || !['flat', 'nested'].includes(String(settings.style))) return undefined;
  return {minLevel, maxLevel, style: settings.style as TableOfContentsSettings['style']};
}

export function parseTableOfContentsSettings(json: string): TableOfContentsSettings | undefined {
  try { return tableOfContentsSettings(JSON.parse(json)); } catch { return undefined; }
}
