-- ADMIN-001: extend native sessions; preserve every existing identity and cookie.
ALTER TABLE sessions ADD COLUMN auth_protocol TEXT CHECK(auth_protocol IS NULL OR auth_protocol='saml');
ALTER TABLE sessions ADD COLUMN saml_generation INTEGER;
CREATE TABLE saml_provider_config (
 workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 generation INTEGER NOT NULL DEFAULT 1,
 idp_entity_id TEXT NOT NULL,
 sso_url TEXT NOT NULL,
 certificate TEXT NOT NULL,
 email_domain TEXT NOT NULL,
 dns_challenge TEXT NOT NULL,
 domain_status TEXT NOT NULL DEFAULT 'pending' CHECK(domain_status IN ('pending','verified','failed')),
 domain_verified_at INTEGER,
 domain_checked_at INTEGER,
 domain_failed_at INTEGER,
 domain_failure TEXT,
 allowed_emails_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(allowed_emails_json)),
 enforced INTEGER NOT NULL DEFAULT 0 CHECK(enforced IN (0,1) AND enforced<=enabled),
 break_glass_owner_id TEXT REFERENCES members(id),
 updated_by_member_id TEXT REFERENCES members(id),
 updated_at INTEGER NOT NULL,
 CHECK(enforced=0 OR break_glass_owner_id IS NOT NULL)
);
CREATE TABLE saml_requests (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 relay_digest TEXT NOT NULL UNIQUE,
 browser_digest TEXT NOT NULL,
 generation INTEGER NOT NULL,
 return_to TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 consumed_at INTEGER
);
CREATE TABLE saml_assertion_replay (
 issuer TEXT NOT NULL,
 assertion_id TEXT NOT NULL,
 consumed_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(issuer,assertion_id)
);
-- Enforced installations always retain exactly one active owner mailbox path.
CREATE TRIGGER saml_keep_break_glass_owner BEFORE UPDATE OF role,status,member_kind ON members
WHEN (NEW.role!='owner' OR NEW.status!='active' OR NEW.member_kind!='member')
 AND EXISTS(SELECT 1 FROM saml_provider_config c WHERE c.workspace_id=OLD.workspace_id AND c.enabled=1 AND c.enforced=1 AND c.break_glass_owner_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'SAML_BREAK_GLASS_OWNER_REQUIRED'); END;
CREATE TRIGGER saml_keep_break_glass_owner_delete BEFORE DELETE ON members
WHEN EXISTS(SELECT 1 FROM saml_provider_config c WHERE c.workspace_id=OLD.workspace_id AND c.enabled=1 AND c.enforced=1 AND c.break_glass_owner_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'SAML_BREAK_GLASS_OWNER_REQUIRED'); END;
