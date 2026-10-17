-- CONT-011. Homes remain ordinary pages, with their existing revision history
-- and access rules. Hub curation belongs to the workspace, not a new ledger.
ALTER TABLE containers ADD COLUMN home_page_id TEXT REFERENCES pages(id) ON DELETE SET NULL;
ALTER TABLE workspaces ADD COLUMN company_hub_json TEXT NOT NULL DEFAULT '{"title":"Company hub","description":"","linkPageIds":[],"announcementPageIds":[],"keyPageIds":[]}';
ALTER TABLE workspaces ADD COLUMN company_hub_revision_id TEXT;
