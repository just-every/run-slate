-- Preserve delivery history; old rows lack recoverable link custody and cannot be resent.
ALTER TABLE mail_deliveries ADD COLUMN payload_ciphertext TEXT;
ALTER TABLE mail_deliveries ADD COLUMN provider_key_digest TEXT;
ALTER TABLE mail_deliveries ADD COLUMN magic_link_id TEXT REFERENCES magic_links(id) ON DELETE SET NULL;
ALTER TABLE mail_deliveries ADD COLUMN request_digest TEXT;
ALTER TABLE mail_deliveries ADD COLUMN operation_key TEXT;
ALTER TABLE mail_deliveries ADD COLUMN requested_by_member_id TEXT REFERENCES members(id);
ALTER TABLE mail_deliveries ADD COLUMN next_attempt_at TEXT;
ALTER TABLE mail_deliveries ADD COLUMN lease_until TEXT;
ALTER TABLE mail_deliveries ADD COLUMN cycle_started_at TEXT;
ALTER TABLE mail_deliveries ADD COLUMN cycle_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mail_deliveries ADD COLUMN delivery_phase TEXT NOT NULL DEFAULT 'legacy';
CREATE UNIQUE INDEX mail_request_identity ON mail_deliveries(request_digest) WHERE request_digest IS NOT NULL;
CREATE INDEX mail_due ON mail_deliveries(delivery_phase,next_attempt_at);

-- Old populated workspaces have already passed onboarding. Never infer completion
-- from today's empty tree after an owner deletes or archives their content.
ALTER TABLE workspaces ADD COLUMN first_run_completed_at TEXT;
UPDATE workspaces SET first_run_completed_at=updated_at WHERE EXISTS (SELECT 1 FROM containers WHERE workspace_id=workspaces.id) OR EXISTS (SELECT 1 FROM pages WHERE workspace_id=workspaces.id);

CREATE TRIGGER core_acl_invitation_authority_update AFTER UPDATE OF revoked_at,accepted_by_member_id,expires_at ON invitations BEGIN UPDATE core_acl_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER core_acl_magic_authority_update AFTER UPDATE OF used_at,expires_at ON magic_links BEGIN UPDATE core_acl_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER core_acl_magic_authority_delete AFTER DELETE ON magic_links BEGIN UPDATE core_acl_epoch SET epoch=epoch+1 WHERE id=1; END;
