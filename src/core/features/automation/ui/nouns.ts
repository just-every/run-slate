import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";

/** The product vocabulary, resolved once so no automation surface hard-codes a noun. */
export const recordNoun = knowledgeNoun("record");
export const containerNoun = knowledgeNoun("container");
export const memberNoun = knowledgeNoun("member");

/** Capitalise a vocabulary noun for the start of a sentence. */
export function sentenceCase(noun: string): string {
  return noun.length === 0 ? noun : `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
}

/** The plural form, for counts and list headings. */
export function plural(noun: string): string {
  return `${noun}s`;
}
