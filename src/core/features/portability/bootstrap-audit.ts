/** Native sign-in audit is bootstrap custody only while it belongs to a live setup-owner session. */
export const emptyBootstrapAuditSelect = `SELECT NOT EXISTS(
 SELECT 1 FROM activity_entries a WHERE NOT EXISTS(
  SELECT 1 FROM sessions s JOIN members m ON m.id=s.member_id
  WHERE a.id='signin:'||s.id AND a.action='auth.sign-in' AND a.feature='auth'
   AND a.target_kind='member' AND a.target_id=m.id AND a.actor_member_id=m.id
   AND a.workspace_id=m.workspace_id AND a.detail_json='{}'
   AND m.is_setup_owner=1 AND m.role='owner' AND m.member_kind='member' AND m.status='active'
 )) AS empty`;
