import { knowledgeNoun, type KnowledgeNoun } from "../../../shared/knowledge/vocabulary";

/** The product noun, exactly as the vocabulary module spells it. */
export function noun(key: KnowledgeNoun): string {
  return knowledgeNoun(key);
}

/** The plural of a product noun. */
export function nounPlural(key: KnowledgeNoun): string {
  return `${knowledgeNoun(key)}s`;
}

/** Capitalise a noun for a heading or the start of a sentence. */
export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "Containers", "Members" — a capitalised plural for a heading. */
export function pluralHeading(key: KnowledgeNoun): string {
  return capitalise(nounPlural(key));
}

/** "1 member", "8 members" — a counted product noun. */
export function countOf(count: number, key: KnowledgeNoun): string {
  return `${count} ${count === 1 ? noun(key) : nounPlural(key)}`;
}
