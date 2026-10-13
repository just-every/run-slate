/** Disposable identities are empty or the sole native setup owner, regardless of vocabulary.
 * Only the untouched vocabulary inserted by native first-mailbox bootstrap is disposable. */
export const emptyBootstrapStatusSelect = `SELECT (
  ((NOT EXISTS(SELECT 1 FROM workspaces) AND NOT EXISTS(SELECT 1 FROM members))
    OR ((SELECT COUNT(*) FROM workspaces)=1
    AND (SELECT COUNT(*) FROM members)=1
    AND EXISTS(SELECT 1 FROM members m JOIN workspaces w ON w.id=m.workspace_id
      WHERE m.is_setup_owner=1 AND m.role='owner' AND m.member_kind='member' AND m.status='active')))
  AND (NOT EXISTS(SELECT 1 FROM status_entries)
  OR ((SELECT COUNT(*) FROM status_entries)=4
    AND (SELECT COUNT(DISTINCT workspace_id) FROM status_entries)=1 AND NOT EXISTS(
    SELECT 1 FROM status_entries s LEFT JOIN workspaces w ON w.id=s.workspace_id
    WHERE w.id IS NULL OR w.first_run_completed_at IS NOT NULL
      OR s.created_at<>w.created_at OR s.updated_at<>s.created_at OR s.retired_at IS NOT NULL
      OR NOT (
        (s.key='rough-draft' AND s.label='Rough draft' AND s.color='#8b9098' AND s.requires_verification=0)
        OR (s.key='in-progress' AND s.label='In progress' AND s.color='#4488cc' AND s.requires_verification=0)
        OR (s.key='ready-for-review' AND s.label='Ready for review' AND s.color='#cc9900' AND s.requires_verification=0)
        OR (s.key='verified' AND s.label='Verified' AND s.color='#228855' AND s.requires_verification=1)
      )
  )))
) AS empty`;
