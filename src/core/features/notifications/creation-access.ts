/** SQL predicates run inside the originating atomic batch, after newly granted access.
 * They deliberately evaluate live grants rather than a cached ACL or a pre-write snapshot. */
export function containerReadableSql(member:string,container:string,workspace:string,now:string){
 return `EXISTS(SELECT 1 FROM containers c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id=${container} AND c.workspace_id=${workspace} AND c.trashed_at IS NULL AND (${member}.member_kind<>'guest' OR (c.guest_access<>'forbidden' AND w.guest_access<>'forbidden')) AND (EXISTS(SELECT 1 FROM container_owners co WHERE co.container_id=c.id AND co.member_id=${member}.id) OR (c.visibility<>'personal' AND EXISTS(SELECT 1 FROM container_grants g WHERE g.container_id=c.id AND ${grantSql(member,'c',now)}))))`;
}
function grantSql(member:string,container:string,now:string){return `g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>${now}) AND (g.principal_kind='member' AND g.principal_id=${member}.id OR g.principal_kind='group' AND EXISTS(SELECT 1 FROM group_members gm JOIN groups gg ON gg.id=gm.group_id WHERE gm.member_id=${member}.id AND gm.group_id=g.principal_id AND gg.workspace_id=${member}.workspace_id) OR ${member}.member_kind<>'guest' AND ${container}.visibility<>'personal' AND (g.principal_kind='workspace' AND g.principal_id=${member}.workspace_id OR g.principal_kind='container' AND g.principal_id=${container}.id AND (EXISTS(SELECT 1 FROM container_members cm WHERE cm.container_id=${container}.id AND cm.member_id=${member}.id) OR EXISTS(SELECT 1 FROM container_owners co WHERE co.container_id=${container}.id AND co.member_id=${member}.id))))`}
export function pageReadableSql(member:string,page:string,workspace:string,now:string,includeTrashed=false){
 const privatePage="COALESCE((SELECT prior_lifecycle FROM content_archive_locations WHERE page_id=p.id AND p.lifecycle='archived'),p.lifecycle) IN ('draft','scheduled')";
 // Match principals once over the grant candidates. Repeating the full match
 // expression for own, inherited and container grants exceeds D1's expression
 // depth when a notification also checks its source audience.
 return `EXISTS(SELECT 1 FROM pages p JOIN containers c ON c.id=p.container_id JOIN workspaces w ON w.id=p.workspace_id
 WHERE p.id=${page} AND p.workspace_id=${workspace} AND p.deleted_at IS NULL AND ${includeTrashed?'1':'p.trashed_at IS NULL'} AND c.trashed_at IS NULL
 AND (c.visibility<>'personal' OR EXISTS(SELECT 1 FROM container_owners co WHERE co.container_id=c.id AND co.member_id=${member}.id))
 AND (${member}.member_kind<>'guest' OR (c.guest_access<>'forbidden' AND w.guest_access<>'forbidden'))
 AND ((${privatePage} AND p.author_member_id=${member}.id) OR EXISTS(
 WITH RECURSIVE chain(id,parent_id,inheritance,depth) AS (
  SELECT p.id,p.parent_page_id,p.access_inheritance,0
  UNION ALL SELECT a.id,a.parent_page_id,a.access_inheritance,chain.depth+1 FROM pages a JOIN chain ON a.id=chain.parent_id
   WHERE chain.inheritance<>'restricted' AND a.container_id=p.container_id AND a.workspace_id=p.workspace_id AND a.deleted_at IS NULL AND chain.depth<20
 ), candidates AS (
  SELECT g.principal_kind,g.principal_id,g.revoked_at,g.expires_at FROM page_grants g JOIN chain ON chain.id=g.page_id
   WHERE NOT (${privatePage}) OR (chain.depth=0 AND g.principal_kind IN ('member','group'))
  UNION ALL SELECT g.principal_kind,g.principal_id,g.revoked_at,g.expires_at FROM container_grants g WHERE g.container_id=c.id
   AND NOT (${privatePage}) AND NOT EXISTS(SELECT 1 FROM chain WHERE inheritance='restricted')
   AND NOT EXISTS(SELECT 1 FROM chain WHERE parent_id IS NOT NULL AND inheritance<>'restricted' AND NOT EXISTS(SELECT 1 FROM chain child WHERE child.id=chain.parent_id))
 ) SELECT 1 FROM candidates g WHERE ${grantSql(member,'c',now)})))`;
}
