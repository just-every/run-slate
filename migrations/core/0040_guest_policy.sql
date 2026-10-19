ALTER TABLE workspaces ADD COLUMN guest_default_expiry_days INTEGER CHECK (guest_default_expiry_days BETWEEN 1 AND 3650);
ALTER TABLE workspaces ADD COLUMN guest_allowed_domains TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(guest_allowed_domains));
ALTER TABLE workspaces ADD COLUMN guest_denied_domains TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(guest_denied_domains));
ALTER TABLE members ADD COLUMN guest_expires_at TEXT;
ALTER TABLE invitations ADD COLUMN guest_expires_at TEXT;
CREATE TRIGGER guest_policy_authority AFTER UPDATE OF guest_default_expiry_days,guest_allowed_domains,guest_denied_domains ON workspaces
BEGIN UPDATE core_acl_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER guest_expiry_authority AFTER UPDATE OF guest_expires_at ON members
BEGIN UPDATE core_acl_epoch SET epoch=epoch+1 WHERE id=1; END;
