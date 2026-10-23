-- Numbered above every concurrent candidate immediately before publication.
CREATE TABLE public_api_tokens (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX public_api_tokens_member ON public_api_tokens(workspace_id,member_id);
-- Removal and authority loss revoke credentials in the same native transaction.
CREATE TRIGGER public_api_tokens_authority AFTER UPDATE OF status,role,member_kind,workspace_id ON members
WHEN NEW.status!='active' OR NEW.role!=OLD.role OR NEW.member_kind!=OLD.member_kind OR NEW.workspace_id!=OLD.workspace_id
BEGIN
  UPDATE public_api_tokens SET revoked_at=COALESCE(revoked_at,NEW.updated_at) WHERE member_id=NEW.id;
END;
