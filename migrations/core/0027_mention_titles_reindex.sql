-- LINK-004: search no longer indexes the title a page mention stored when it was
-- written, since one index serves every reader. Existing derived search rows are
-- rebuilt from canonical content, as rebuildSearchIndex does; a key already waiting
-- keeps its generation. No canonical row changes.
INSERT INTO search_dirty(key,workspace_id,generation) SELECT CASE WHEN page_kind='record' THEN 'record:' ELSE 'page:' END||id,workspace_id,hex(randomblob(16)) FROM pages WHERE true ON CONFLICT(key) DO NOTHING;
INSERT INTO search_dirty(key,workspace_id,generation) SELECT 'template:'||id,workspace_id,hex(randomblob(16)) FROM knowledge_templates WHERE true ON CONFLICT(key) DO NOTHING;
INSERT INTO search_dirty(key,workspace_id,generation) SELECT 'comment-thread:'||id,workspace_id,hex(randomblob(16)) FROM comment_threads WHERE true ON CONFLICT(key) DO NOTHING;
DELETE FROM search_record_cache;
DELETE FROM search_record_build;
DELETE FROM search_record_text;
