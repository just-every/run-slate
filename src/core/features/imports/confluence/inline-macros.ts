import { attributesOf, elementName, findElements, textOf, type MarkupNode } from '../markup';
import { statusColour } from '../portable-blocks';
import type { TableOfContentsSettings } from '../../editor/table-of-contents';

export function macroParameters(node: MarkupNode): Record<string, string> {
  return Object.fromEntries(findElements(node, 'ac:parameter').map(parameter => [attributesOf(parameter)['ac:name'] ?? '', textOf(parameter).trim()]));
}

export const isStatusMacro = (node: MarkupNode) => elementName(node) === 'ac:structured-macro' && attributesOf(node)['ac:name'] === 'status';
export function confluenceStatus(node: MarkupNode) {
  if (!isStatusMacro(node)) return undefined;
  const parameters = macroParameters(node);
  const rawColour = (parameters.colour ?? 'grey').toLowerCase();
  const colour = statusColour(rawColour === 'gray' ? 'grey' : rawColour);
  return {text: parameters.title ?? '', colour};
}

export function confluenceToc(parameters: Record<string, string>): TableOfContentsSettings {
  const level = (value: string | undefined, defaultValue: number) => {
    const number = value ? Number(value) : defaultValue;
    return Number.isInteger(number) ? Math.max(1, Math.min(3, number)) : defaultValue;
  };
  const minLevel = level(parameters.minLevel, 1), maxLevel = Math.max(minLevel, level(parameters.maxLevel, 3));
  return {minLevel, maxLevel, style: parameters.type === 'flat' || parameters.style === 'flat' ? 'flat' : 'nested'};
}
