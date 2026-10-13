import type { MemberSubject } from '../../shared/knowledge/model';

/**
 * A candidate page's live access level (0 none, 1 view … 4 full) over the CTEs below. It
 * reads the aliases p (pages), pl (page_levels), g (page_grants_live), c (containers_live),
 * cl (container_levels), l (content_archive_locations) and s (subject).
 */
export const pageAccessLevelSql=`CASE WHEN p.id IS NULL OR p.deleted_at IS NOT NULL OR p.workspace_id<>s.workspace OR NOT s.trash AND p.trashed_at IS NOT NULL OR c.id IS NULL OR c.visibility='personal' AND NOT c.owned THEN 0
 WHEN p.parent_page_id IS NOT NULL THEN COALESCE(pl.level,0)
 WHEN p.lifecycle IN ('draft','scheduled') OR p.lifecycle='archived' AND l.prior_lifecycle IN ('draft','scheduled') THEN CASE WHEN p.author_member_id=s.member THEN 4 ELSE COALESCE(g.private_level,0) END
 ELSE MAX(COALESCE(g.level,0),CASE WHEN p.access_inheritance='restricted' THEN 0 ELSE COALESCE(cl.level,0) END) END`;
/** Same grant rules as current-access; evaluated over candidates and their live ancestors. */
export function accessSql(subject:MemberSubject,now:string,includeTrashed:boolean) {
 const parameters=[subject.memberId,subject.workspaceId,JSON.stringify(subject.groupIds),JSON.stringify(subject.containerIds),+subject.isGuest,now,+includeTrashed];
 return {parameters,sql:`
 subject AS (SELECT ? AS member,? AS workspace,? AS groups,? AS containers,? AS guest,? AS now,? AS trash),
 containers_live AS MATERIALIZED (
 SELECT c.*, EXISTS(SELECT 1 FROM container_owners o,subject s WHERE o.container_id=c.id AND o.member_id=s.member) AS owned
 FROM containers c JOIN workspaces w ON w.id=c.workspace_id,subject s
 WHERE c.workspace_id=s.workspace AND (s.trash OR c.trashed_at IS NULL)
 AND (NOT s.guest OR (c.guest_access<>'forbidden' AND w.guest_access<>'forbidden'))
 ),
 page_grants_live AS MATERIALIZED (
 SELECT g.page_id,MAX(CASE g.level WHEN 'full' THEN 4 WHEN 'edit' THEN 3 WHEN 'comment' THEN 2 ELSE 1 END) AS level,
 MAX(CASE WHEN g.principal_kind IN ('member','group') THEN CASE g.level WHEN 'full' THEN 4 WHEN 'edit' THEN 3 WHEN 'comment' THEN 2 ELSE 1 END ELSE 0 END) AS private_level
 FROM page_grants g JOIN pages p ON p.id=g.page_id JOIN containers_live c ON c.id=p.container_id,subject s
 WHERE g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>s.now)
 AND (g.principal_kind='member' AND g.principal_id=s.member
 OR g.principal_kind='group' AND g.principal_id IN (SELECT value FROM json_each(s.groups))
 OR NOT s.guest AND c.visibility<>'personal' AND (g.principal_kind='workspace' AND g.principal_id=s.workspace OR g.principal_kind='container' AND g.principal_id=p.container_id AND g.principal_id IN (SELECT value FROM json_each(s.containers))))
 GROUP BY g.page_id),
 container_levels AS MATERIALIZED (
 SELECT c.id,MAX(CASE g.level WHEN 'full' THEN 4 WHEN 'edit' THEN 3 WHEN 'comment' THEN 2 WHEN 'view' THEN 1 ELSE 0 END) AS level
 FROM containers_live c LEFT JOIN container_grants g ON g.container_id=c.id,subject s
 WHERE g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>s.now)
 AND (g.principal_kind='member' AND g.principal_id=s.member OR g.principal_kind='group' AND g.principal_id IN (SELECT value FROM json_each(s.groups))
 OR NOT s.guest AND c.visibility<>'personal' AND (g.principal_kind='workspace' AND g.principal_id=s.workspace OR g.principal_kind='container' AND g.principal_id=c.id AND g.principal_id IN (SELECT value FROM json_each(s.containers)))) GROUP BY c.id),
 candidate_pages AS MATERIALIZED (
 SELECT p.id,p.parent_page_id,p.container_id,p.author_member_id,p.access_inheritance,CASE WHEN p.lifecycle='archived' AND l.prior_lifecycle IN ('draft','scheduled') THEN l.prior_lifecycle ELSE p.lifecycle END AS access_lifecycle
 FROM pages p JOIN containers_live c ON c.id=p.container_id LEFT JOIN content_archive_locations l ON l.page_id=p.id,subject s
 WHERE p.parent_page_id IS NOT NULL AND p.id IN (SELECT page_id FROM candidates WHERE page_id IS NOT NULL) AND p.workspace_id=s.workspace AND p.deleted_at IS NULL AND (s.trash OR p.trashed_at IS NULL) AND (c.visibility<>'personal' OR c.owned)
 ),
 ancestry(origin,id,parent,container,depth,restricted,path) AS (
 SELECT id,id,parent_page_id,container_id,0,access_inheritance='restricted',json_array(id) FROM candidate_pages WHERE parent_page_id IS NOT NULL
 UNION ALL
 SELECT a.origin,p.id,p.parent_page_id,p.container_id,a.depth+1,p.access_inheritance='restricted',json_insert(a.path,'$[#]',p.id)
 FROM ancestry a JOIN pages p ON p.id=a.parent,subject s
 WHERE NOT a.restricted AND a.depth<20 AND p.container_id=a.container AND p.workspace_id=s.workspace AND p.deleted_at IS NULL AND p.id NOT IN (SELECT value FROM json_each(a.path))
 ),
 ancestry_levels AS (
 SELECT a.origin,MAX(COALESCE(g.level,0)) AS level,MAX(a.parent IS NULL OR a.restricted) AS valid,MAX(a.restricted) AS blocked FROM ancestry a LEFT JOIN page_grants_live g ON g.page_id=a.id GROUP BY a.origin
 ),
 page_levels AS MATERIALIZED (
 SELECT p.id,CASE WHEN p.access_lifecycle IN ('draft','scheduled') THEN CASE WHEN p.author_member_id=s.member THEN 4 ELSE COALESCE(g.private_level,0) END
 ELSE MAX(COALESCE(a.level,g.level,0),CASE WHEN COALESCE(a.blocked,p.access_inheritance='restricted') THEN 0 ELSE COALESCE(c.level,0) END) END AS level
 FROM candidate_pages p LEFT JOIN ancestry_levels a ON a.origin=p.id LEFT JOIN page_grants_live g ON g.page_id=p.id LEFT JOIN container_levels c ON c.id=p.container_id,subject s WHERE p.parent_page_id IS NULL OR a.valid
 )`};
}
