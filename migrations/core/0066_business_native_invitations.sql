-- Bind an admitted native invitation to its signed Business person ID, once.
-- The address is delivery data; it cannot transfer an existing binding.
CREATE TABLE slate_business_invitations (
  business_id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL UNIQUE REFERENCES invitations(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL
);
