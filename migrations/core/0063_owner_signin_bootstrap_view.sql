-- `rer signin` (a mail-off deployment's owner link) picks the owner with Base's own query, which
-- reads oa_operators and joins oa_bootstrap to prefer the claimed owner. oa_operators is the
-- read-only projection of members (0034); this is the same for oa_bootstrap: the installation's
-- first active owner, derived, never a second owner ledger. members and member_authority stay
-- the only source.
CREATE VIEW oa_bootstrap AS
 SELECT 1 AS singleton, id AS claim_id, created_at AS claimed_at
 FROM oa_operators WHERE role = 'owner' AND status = 'active' ORDER BY created_at, id LIMIT 1;
