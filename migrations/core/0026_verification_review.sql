-- STAT-003/STAT-004: the review list and the lapse notice read each page's latest
-- verification and the verifications that are due. Additive indexes only.
CREATE INDEX IF NOT EXISTS page_verifications_page_latest ON page_verifications(page_id, created_at, id);
CREATE INDEX IF NOT EXISTS page_verifications_due ON page_verifications(expires_at) WHERE lapsed_notified_at IS NULL;
