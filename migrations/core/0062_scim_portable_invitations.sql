-- Invitations carry sign-in authority and are excluded from installation archives.
-- Keep their native integrity without making portable directory rows depend on
-- the excluded table in the archive's foreign-key graph. Preserve installed rows.
DROP TRIGGER scim_invitation_accepted;

CREATE TABLE scim_resources_portable (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  resource_type TEXT NOT NULL CHECK(resource_type IN ('User','Group')),
  external_id TEXT,
  member_id TEXT REFERENCES members(id),
  invitation_id TEXT,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  user_name TEXT,
  display_name TEXT,
  given_name TEXT,
  family_name TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending','active','inactive','deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO scim_resources_portable SELECT * FROM scim_resources;
DROP TABLE scim_resources;
ALTER TABLE scim_resources_portable RENAME TO scim_resources;

CREATE UNIQUE INDEX scim_resources_external ON scim_resources(workspace_id,resource_type,external_id) WHERE external_id IS NOT NULL AND state!='deleted';
CREATE UNIQUE INDEX scim_resources_user ON scim_resources(workspace_id,lower(user_name)) WHERE resource_type='User' AND state!='deleted';
CREATE UNIQUE INDEX scim_resources_member ON scim_resources(member_id) WHERE member_id IS NOT NULL AND state!='deleted';
CREATE UNIQUE INDEX scim_resources_group ON scim_resources(group_id) WHERE group_id IS NOT NULL;

CREATE TRIGGER scim_resource_invitation_insert BEFORE INSERT ON scim_resources
WHEN NEW.invitation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invitations WHERE id=NEW.invitation_id)
BEGIN SELECT RAISE(ABORT,'FOREIGN KEY constraint failed'); END;
CREATE TRIGGER scim_resource_invitation_update BEFORE UPDATE OF invitation_id ON scim_resources
WHEN NEW.invitation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invitations WHERE id=NEW.invitation_id)
BEGIN SELECT RAISE(ABORT,'FOREIGN KEY constraint failed'); END;
CREATE TRIGGER scim_invitation_deleted AFTER DELETE ON invitations
BEGIN UPDATE scim_resources SET invitation_id=NULL WHERE invitation_id=OLD.id; END;
CREATE TRIGGER scim_invitation_id_update BEFORE UPDATE OF id ON invitations
WHEN NEW.id!=OLD.id AND EXISTS(SELECT 1 FROM scim_resources WHERE invitation_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'FOREIGN KEY constraint failed'); END;
CREATE TRIGGER scim_invitation_accepted AFTER UPDATE OF accepted_by_member_id ON invitations
WHEN NEW.accepted_by_member_id IS NOT NULL
BEGIN
  UPDATE scim_resources SET member_id=NEW.accepted_by_member_id,state='active',updated_at=COALESCE((SELECT updated_at FROM members WHERE id=NEW.accepted_by_member_id),updated_at) WHERE invitation_id=NEW.id AND state='pending';
END;
