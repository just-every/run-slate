import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";

export const memberNoun = knowledgeNoun("member");
export const containerNoun = knowledgeNoun("container");
export const pageBodyNoun = knowledgeNoun("pageBody");

/** Capitalise a vocabulary noun for the start of a sentence. */
export function sentenceCase(noun: string): string {
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

/** The plural of the vocabulary nouns this feature writes in sentences. */
export function pluralise(noun: string): string {
  return `${noun}s`;
}
