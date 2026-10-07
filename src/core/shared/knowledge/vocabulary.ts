export const knowledgeNouns = {
  container: "container",
  record: "record",
  pageBody: "page body",
  member: "member",
} as const;

export type KnowledgeNoun = keyof typeof knowledgeNouns;

export function knowledgeNoun(noun: KnowledgeNoun): string {
  return knowledgeNouns[noun];
}
