-- Renumber on integration, after all installed core migrations.
CREATE TABLE scim_credentials (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  owner_member_id TEXT NOT NULL REFERENCES members(id),
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX scim_credentials_owner ON scim_credentials(workspace_id,owner_member_id);
CREATE TABLE scim_resources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  resource_type TEXT NOT NULL CHECK(resource_type IN ('User','Group')),
  external_id TEXT,
  member_id TEXT REFERENCES members(id),
  invitation_id TEXT REFERENCES invitations(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  user_name TEXT,
  display_name TEXT,
  given_name TEXT,
  family_name TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending','active','inactive','deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX scim_resources_external ON scim_resources(workspace_id,resource_type,external_id) WHERE external_id IS NOT NULL AND state!='deleted';
CREATE UNIQUE INDEX scim_resources_user ON scim_resources(workspace_id,lower(user_name)) WHERE resource_type='User' AND state!='deleted';
CREATE UNIQUE INDEX scim_resources_member ON scim_resources(member_id) WHERE member_id IS NOT NULL AND state!='deleted';
CREATE UNIQUE INDEX scim_resources_group ON scim_resources(group_id) WHERE group_id IS NOT NULL;
-- Authority loss makes every previously issued credential permanently unusable.
CREATE TRIGGER scim_credentials_authority AFTER UPDATE OF status,role,member_kind,workspace_id,email ON members
WHEN NEW.status!='active' OR NEW.role!='owner' OR NEW.member_kind!='member' OR NEW.workspace_id!=OLD.workspace_id OR NEW.email!=OLD.email
BEGIN
  UPDATE scim_credentials SET token_hash=NULL,revoked_at=COALESCE(revoked_at,NEW.updated_at),updated_at=NEW.updated_at WHERE owner_member_id=NEW.id;
END;
-- Acceptance links the existing SCIM resource to the native, stable member ID.
CREATE TRIGGER scim_invitation_accepted AFTER UPDATE OF accepted_by_member_id ON invitations
WHEN NEW.accepted_by_member_id IS NOT NULL
BEGIN
  UPDATE scim_resources SET member_id=NEW.accepted_by_member_id,state='active',updated_at=COALESCE((SELECT updated_at FROM members WHERE id=NEW.accepted_by_member_id),updated_at) WHERE invitation_id=NEW.id AND state='pending';
END;

-- Removed native principals cannot regain an earlier remote execution credential on re-invitation.
CREATE TRIGGER scim_removed_remote_credentials AFTER UPDATE OF status ON members
WHEN NEW.status='removed' BEGIN
 UPDATE intelligence_agent_credentials SET revoked_at=COALESCE(revoked_at,NEW.updated_at) WHERE owner_id=NEW.id OR subject_id=NEW.id;
END;
