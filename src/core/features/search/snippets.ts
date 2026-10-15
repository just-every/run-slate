import type { FeatureContext } from "../../app/feature-context";

const memberId = "[0-9A-HJKMNP-TV-Z]{26}";
const date = "\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:\\d{2}))?";

/** Keep dates and member identifiers intact so presentation can label them. */
export function snippetText(text: string, terms: string[]): string {
  const position = Math.max(0, text.toLocaleLowerCase().indexOf(terms[0] ?? ""));
  let from = Math.max(0, position - 65);
  let to = from + 220;
  for (const match of text.matchAll(new RegExp(`\\b(?:${date}|${memberId})\\b`, "g"))) {
    const end = match.index + match[0].length;
    if (match.index < from && end > from) from = match.index;
    if (match.index < to && end > to) to = end;
  }
  return (from ? "…" : "") + text.slice(from, to) + (text.length > to ? "…" : "");
}

/** Resolve only IDs already disclosed in authorized snippets, within this workspace. */
export async function nameSnippetMembers<T extends { kind: string; id: string; revisionId: string; snippet: string }>(
  ctx: FeatureContext,
  items: T[],
): Promise<T[]> {
  const records = items.filter(item => item.kind === "record");
  if (!records.length) return items;
  // Use the exact working/published variant already authorized by search. Only
  // person fields are labelled: identifiers and related page IDs keep their meaning.
  const members = await ctx.db.prepare(`
    SELECT p.id AS page_id,person.value AS member_id,m.display_name
    FROM json_each(?) requested
    JOIN pages p ON p.id=json_extract(requested.value,'$.id') AND p.workspace_id=?
    JOIN database_records d ON d.page_id=p.id
    JOIN database_fields f ON f.database_id=d.database_id AND f.field_type='person'
    LEFT JOIN page_revisions r ON r.id=p.published_revision_id AND r.page_id=p.id
    JOIN json_each(CASE WHEN json_extract(requested.value,'$.revisionId')=p.published_revision_id
      AND p.published_revision_id<>p.working_revision_id THEN json_extract(r.properties_json,'$.databaseFields')
      ELSE d.field_values_json END) fields ON fields.key=f.id
    JOIN json_each(CASE WHEN fields.type='array' THEN fields.value END) person
    LEFT JOIN members m ON m.id=person.value AND m.workspace_id=p.workspace_id AND m.status='active'
  `).bind(JSON.stringify(records.map(item => ({ id: item.id, revisionId: item.revisionId }))), ctx.actor.workspaceId)
    .all<{ page_id: string; member_id: string; display_name: string | null }>();
  const names = new Map<string, Map<string, string>>();
  for (const member of members.results) {
    const labels = names.get(member.page_id) ?? new Map<string, string>();
    labels.set(member.member_id, member.display_name ?? "Unavailable member");
    names.set(member.page_id, labels);
  }
  return items.map(item => {
    const labels = item.kind === "record" ? names.get(item.id) : undefined;
    if (!labels?.size) return item;
    const pattern = [...labels.keys()].filter(Boolean)
      .map(id => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    if (!pattern) return item;
    return { ...item, snippet: item.snippet.replace(
      new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, "gu"),
      id => labels.get(id)!,
    ) };
  });
}
