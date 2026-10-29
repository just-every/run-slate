ALTER TABLE page_revisions ADD COLUMN agent_attribution_json TEXT;
ALTER TABLE record_revisions ADD COLUMN agent_attribution_json TEXT;
ALTER TABLE page_verifications ADD COLUMN agent_attribution_json TEXT;
ALTER TABLE pages ADD COLUMN agent_creator_json TEXT;
