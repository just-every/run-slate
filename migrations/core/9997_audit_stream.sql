CREATE TABLE audit_settings (
 workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
 retention_days INTEGER NOT NULL DEFAULT 365 CHECK(retention_days>=365),
 updated_by_member_id TEXT REFERENCES members(id),
 updated_at TEXT NOT NULL
);
-- Session creation is the common native sign-in commit, including SAML and local sessions.
CREATE TRIGGER audit_session_signin AFTER INSERT ON sessions BEGIN
 INSERT INTO activity_entries(id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,occurred_at)
 SELECT 'signin:'||NEW.id,workspace_id,id,'auth','auth.sign-in','member',id,'{}',NEW.created_at FROM members WHERE id=NEW.member_id;
END;
-- Native identity administration has its own audit store; mirror action identity only, never its value.
CREATE TRIGGER audit_identity_setting AFTER INSERT ON auth_identity_audit BEGIN
 INSERT INTO activity_entries(id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,occurred_at)
 SELECT 'identity:'||NEW.id,workspace_id,id,'auth','auth.setting.'||NEW.action,'workspace',workspace_id,'{}',strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at/1000.0,'unixepoch') FROM members WHERE id=NEW.actor_id;
END;
