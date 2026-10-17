import type { AdvancedSearch, SearchClause } from './language';
import { candidateMatch } from './tokens';
type Bind = (value: string | number | null) => string;

/** Only necessary positive text anchors may restrict the indexed candidate set.
 * A metadata-only or negative-only OR arm requires unrestricted candidates. */
export function searchCandidateExpression(search: AdvancedSearch): string {
  const groups = search.groups.map(group => group.filter(clause => !clause.negated && (clause.field === 'text' || clause.field === 'title')).map(clause => clause.value));
  if (groups.some(group => !group.length)) return '';
  return groups.map(group => `(${candidateMatch(group)})`).join(' OR ');
}
export function searchCandidateSql(search: AdvancedSearch, alias: string, bind: Bind): string {
  return search.groups.map(group => '(' + (group.filter(clause => !clause.negated && ['text', 'title'].includes(clause.field)).map(clause => {
    const value = bind(clause.value);
    return clause.field === 'title' ? `instr(${alias}.title_fold,${value})>0` : `(instr(${alias}.title_fold,${value})>0 OR instr(${alias}.text_fold,${value})>0)`;
  }).join(' AND ') || '1') + ')').join(' OR ');
}
function clauseSql(clause: SearchClause, bind: Bind) {
  const value = bind(clause.value);
  switch (clause.field) {
    case 'text': return `(instr(v.title_fold,${value})>0 OR instr(v.text_fold,${value})>0)`;
    case 'title': return `instr(v.title_fold,${value})>0`;
    case 'label': return `EXISTS(SELECT 1 FROM json_each(v.labels_json) label WHERE lower(label.value)=${value})`;
    case 'in': return `EXISTS(SELECT 1 FROM containers container WHERE container.id=v.container_id AND (lower(container.id)=${value} OR lower(container.key)=${value} OR lower(container.name)=${value}))`;
    case 'by': return `EXISTS(SELECT 1 FROM members member WHERE member.workspace_id=v.workspace AND (member.id=v.author_id OR member.id IN (SELECT value FROM json_each(v.contributors_json))) AND (lower(member.id)=${value} OR lower(member.display_name)=${value} OR lower(member.email)=${value}))`;
    case 'owner': return `EXISTS(SELECT 1 FROM members member WHERE member.id=v.owner_id AND (lower(member.id)=${value} OR lower(member.display_name)=${value} OR lower(member.email)=${value}))`;
    case 'status': return `(lower(v.current_status)=${value} OR EXISTS(SELECT 1 FROM status_entries entry WHERE entry.workspace_id=v.workspace AND entry.key=v.current_status AND lower(entry.label)=${value}))`;
    case 'verified': return `v.page_id IS NOT NULL AND v.trust_state${clause.value === 'false' ? "<>'verified'" : '=' + bind(['current', 'true'].includes(clause.value) ? 'verified' : clause.value)}`;
    case 'before': return `v.selected_updated_at<${value}`;
    case 'after': return `v.selected_updated_at>${value}`;
    case 'type': return `v.kind=${value}`;
  }
}
export function advancedSearchSql(search: AdvancedSearch, bind: Bind): string {
  return search.groups.map(group => '(' + (group.map(clause => {
    const sql = clauseSql(clause, bind);
    // NULL metadata is a non-match, including when negating a clause.
    return clause.negated ? `NOT COALESCE((${sql}),0)` : `COALESCE((${sql}),0)`;
  }).join(' AND ') || '1') + ')').join(' OR ');
}
