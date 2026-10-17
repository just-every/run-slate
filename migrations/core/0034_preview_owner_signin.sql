-- The owner's way into a Managed preview: RER writes one single-use grant into the
-- preview's own database, in the shape of Base operator-auth's oa_owner_signins
-- (token_hash is the SHA-256 of the link token; the token itself is never stored),
-- and Slate consumes it natively at /auth/owner-signin. operator_id names a
-- member; there is no foreign key because Base's names oa_operators.
CREATE TABLE oa_owner_signins (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 operator_id TEXT NOT NULL, operator_version INTEGER NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
);
-- RER finds the grant's owner by email in Base's operator columns. This read-only
-- projection of the installation workspace's members is that lookup, not a second
-- owner ledger: members and member_authority stay the only source.
CREATE VIEW oa_operators AS
 SELECT m.id, m.email, m.display_name, m.role, m.status, COALESCE(a.version, 1) AS version, m.created_at
 FROM members m LEFT JOIN member_authority a ON a.member_id = m.id
 WHERE m.workspace_id = (SELECT id FROM workspaces ORDER BY created_at, id LIMIT 1);
