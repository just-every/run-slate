import { pageReadableSql } from '../../notifications/creation-access';

/** The pages among `pageIds` that `memberId` can read now, by the same live check notifications use. */
export async function readablePageIds(db: D1Database, memberId: string, workspaceId: string, pageIds: string[], now: string): Promise<Set<string>> {
  if (!pageIds.length) return new Set();
  const rows = await db.prepare(`SELECT j.value AS id FROM json_each(?1) j JOIN members m ON m.id=?2 AND m.workspace_id=?3 AND m.status='active' WHERE ${pageReadableSql('m', 'j.value', '?3', '?4')}`)
    .bind(JSON.stringify(pageIds), memberId, workspaceId, now).all<{ id: string }>();
  return new Set(rows.results.map(row => row.id));
}
