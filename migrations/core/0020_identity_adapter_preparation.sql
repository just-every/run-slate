-- Existing records keep their identifiers and authority. No prior issuer/subject
-- associations existed, so the new binding table deliberately starts empty.
CREATE TABLE member_identity_bindings (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (issuer, subject)
);
CREATE INDEX member_identity_bindings_member_idx ON member_identity_bindings(member_id);

-- Previously sent GET links cannot be converted into POST credentials.
ALTER TABLE magic_links ADD COLUMN confirmation_version INTEGER NOT NULL DEFAULT 1;
