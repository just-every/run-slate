-- Base operator-auth composes over Slate's own members and sessions. Additive:
-- existing members, roles, groups, guests and live sessions keep their rows.

-- A monotonic authority revision per member, starting at 1. Email, role, kind,
-- status, ownership or workspace changes advance it, which invalidates
-- outstanding proofs and fenced sessions. A separate table keeps every members
-- update, and the ACL epoch trigger it fires, exactly as before.
CREATE TABLE member_authority (
  member_id TEXT PRIMARY KEY NOT NULL REFERENCES members(id),
  version INTEGER NOT NULL CHECK (version > 1)
);
CREATE TRIGGER member_authority_version AFTER UPDATE OF email,role,member_kind,status,is_setup_owner,workspace_id ON members
WHEN OLD.email IS NOT NEW.email OR OLD.role IS NOT NEW.role OR OLD.member_kind IS NOT NEW.member_kind
  OR OLD.status IS NOT NEW.status OR OLD.is_setup_owner IS NOT NEW.is_setup_owner OR OLD.workspace_id IS NOT NEW.workspace_id
BEGIN INSERT INTO member_authority (member_id, version) VALUES (NEW.id, 2) ON CONFLICT(member_id) DO UPDATE SET version=version+1; END;

-- Sessions issued from now on record how they were proven. Rows written before
-- this migration keep kind NULL and their existing 30-day native contract.
ALTER TABLE sessions ADD COLUMN kind TEXT CHECK (kind IS NULL OR kind IN ('native','oidc','dev'));
ALTER TABLE sessions ADD COLUMN authority_version INTEGER;
ALTER TABLE sessions ADD COLUMN issuer TEXT;
ALTER TABLE sessions ADD COLUMN subject TEXT;
ALTER TABLE sessions ADD COLUMN sid TEXT;
ALTER TABLE sessions ADD COLUMN provider_id TEXT;
ALTER TABLE sessions ADD COLUMN provider_linked_at INTEGER;
ALTER TABLE sessions ADD COLUMN provider_generation INTEGER;
ALTER TABLE sessions ADD COLUMN proof_at INTEGER;
ALTER TABLE sessions ADD COLUMN proof_version INTEGER;

-- One-use email proofs: sign-in links and session-bound step-up challenges.
-- Only keyed digests are stored, never the emailed token.
CREATE TABLE auth_proofs (
  id TEXT PRIMARY KEY NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('magic','step_up')),
  member_id TEXT NOT NULL REFERENCES members(id),
  authority_version INTEGER NOT NULL,
  email TEXT NOT NULL,
  session_id TEXT REFERENCES sessions(id),
  action TEXT,
  return_to TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  revoked_at INTEGER,
  CHECK (kind <> 'step_up' OR (session_id IS NOT NULL AND action IS NOT NULL))
);
CREATE INDEX auth_proofs_member_idx ON auth_proofs(member_id, kind);

-- Keyed rate buckets for email requests, confirmations and step-up.
CREATE TABLE auth_limits (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, start INTEGER NOT NULL);

-- The identity-provider policy generation. A changed provider configuration
-- advances it, which ends outstanding provider sessions and transactions.
CREATE TABLE auth_identity_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  generation INTEGER NOT NULL,
  fingerprint TEXT
);
INSERT INTO auth_identity_policy (id, generation, fingerprint) VALUES (1, 1, NULL);

-- An agent credential minted from a local dev session authenticates only behind
-- the local key gate, which a deployed Worker never has.
ALTER TABLE intelligence_agent_credentials ADD COLUMN dev_minted INTEGER NOT NULL DEFAULT 0 CHECK (dev_minted IN (0, 1));
