-- Shared dependency protocol only; accounts, sessions and ownership remain native.
CREATE TABLE IF NOT EXISTS rer_dependency_installation (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), sector_id TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS rer_dependency_link (
 interface TEXT PRIMARY KEY, issuer TEXT NOT NULL, client_id TEXT NOT NULL, metadata TEXT NOT NULL,
 needs_relink INTEGER NOT NULL DEFAULT 0, linked_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rer_dependency_pending (
 interface TEXT PRIMARY KEY, issuer TEXT NOT NULL, approved_by TEXT NOT NULL, expires_at INTEGER NOT NULL, approved_session TEXT NOT NULL, approved_version INTEGER NOT NULL, callbacks TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rer_dependency_codes (
 digest TEXT PRIMARY KEY, created_at INTEGER NOT NULL CHECK(created_at>=0)
);

CREATE TABLE IF NOT EXISTS rer_dependency_keys (interface TEXT PRIMARY KEY, private_key TEXT NOT NULL);

-- Existing pending approvals predate attempt fencing and must be renewed.
ALTER TABLE rer_dependency_pending ADD COLUMN attempt_id TEXT;
DELETE FROM rer_dependency_pending;

-- Null preserves incumbent configured sign-in until the native owner changes it.
ALTER TABLE auth_identity_policy ADD COLUMN idp_sign_in INTEGER CHECK(idp_sign_in IN (0,1));
CREATE TABLE auth_identity_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES members(id),
 action TEXT NOT NULL, value TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE auth_identity_logout (
 issuer TEXT NOT NULL, jti TEXT NOT NULL, consumed_at INTEGER NOT NULL CHECK(consumed_at>=0),
 PRIMARY KEY(issuer,jti)
);
