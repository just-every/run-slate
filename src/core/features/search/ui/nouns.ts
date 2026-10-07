import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";

export const containerNoun = knowledgeNoun("container");
export const recordNoun = knowledgeNoun("record");
export const memberNoun = knowledgeNoun("member");
export const pageBodyNoun = knowledgeNoun("pageBody");

/** Capitalise a vocabulary noun for the start of a sentence or a label. */
export function sentenceCase(noun: string): string {
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}
