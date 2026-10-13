-- FTS is derived candidate selection only; current authorization stays in search/access-sql.
-- Existing JS-folded text is encoded without SQLite lower(), which is ASCII-only.
ALTER TABLE search_text ADD COLUMN tokens TEXT NOT NULL DEFAULT '';
ALTER TABLE search_text ADD COLUMN record_shared INTEGER NOT NULL DEFAULT 0;
UPDATE search_text SET tokens=(
 WITH RECURSIVE fields(field,text) AS (SELECT 0,title_fold UNION ALL SELECT 1,text_fold),
 positions(field,text,n) AS (
  SELECT field,text,1 FROM fields WHERE length(text)>0
  UNION ALL SELECT field,text,n+1 FROM positions WHERE n<length(text)
 ), points AS (SELECT field,n,unicode(substr(text,n,1)) AS cp FROM positions),
 units(field,position,unit) AS (
  SELECT field,n*2,CASE WHEN cp>65535 THEN 55296+((cp-65536)>>10) ELSE cp END FROM points
  UNION ALL SELECT field,n*2+1,56320+((cp-65536)&1023) FROM points WHERE cp>65535
 ), adjacent AS (SELECT field,position,unit,lead(unit) OVER(PARTITION BY field ORDER BY position) AS next FROM units),
 grams(token) AS (
  SELECT 'g1x'||printf('%04x',unit) FROM adjacent
  UNION SELECT 'g2x'||printf('%04x',unit)||'x'||printf('%04x',next) FROM adjacent WHERE next IS NOT NULL
 ) SELECT COALESCE(group_concat(token,' '),'') FROM grams
);
-- SQLite length/substr stop at U+0000 even though instr continues past it.
-- Such prior rows require the canonical JS encoder before becoming candidates;
-- preserve any existing dirty generation instead of acknowledging it here.
INSERT INTO search_dirty(key,workspace_id,generation)
 SELECT key,workspace_id,hex(randomblob(16)) FROM search_text
 WHERE instr(title_fold,char(0))>0 OR instr(text_fold,char(0))>0
 ON CONFLICT(key) DO NOTHING;
-- Prior record rows have body text only. Reproject scalar fields with the same JS
-- renderer as native writes before admitting them to the shared candidate set.
INSERT INTO search_dirty(key,workspace_id,generation)
 SELECT 'record:'||id,workspace_id,hex(randomblob(16)) FROM pages WHERE page_kind='record'
 ON CONFLICT(key) DO NOTHING;
CREATE VIRTUAL TABLE search_fts USING fts5(tokens,tokenize='unicode61 remove_diacritics 0');
INSERT INTO search_fts(rowid,tokens) SELECT rowid,tokens FROM search_text;
CREATE TRIGGER search_fts_insert AFTER INSERT ON search_text BEGIN INSERT INTO search_fts(rowid,tokens) VALUES(NEW.rowid,NEW.tokens); END;
CREATE TRIGGER search_fts_delete AFTER DELETE ON search_text BEGIN DELETE FROM search_fts WHERE rowid=OLD.rowid; END;
CREATE TRIGGER search_fts_update AFTER UPDATE ON search_text BEGIN DELETE FROM search_fts WHERE rowid=OLD.rowid; INSERT INTO search_fts(rowid,tokens) VALUES(NEW.rowid,NEW.tokens); END;

-- Reader-specific relation/formula values are never part of the shared index.
CREATE INDEX pages_search_records ON pages(workspace_id,id) WHERE page_kind='record' AND deleted_at IS NULL;
CREATE TABLE search_record_epoch(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL);
INSERT INTO search_record_epoch VALUES(1,0);
CREATE TABLE search_record_cache(scope TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,generation TEXT NOT NULL,epoch INTEGER NOT NULL,acl INTEGER NOT NULL,expires_at TEXT,as_of TEXT NOT NULL);
-- Leased ownership fences chunk writes and bounds abandoned derived builds.
CREATE TABLE search_record_build(scope TEXT NOT NULL,generation TEXT NOT NULL,workspace_id TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(scope,generation));
CREATE INDEX search_record_build_expiry ON search_record_build(workspace_id,expires_at);
CREATE TABLE search_record_text(scope TEXT NOT NULL,generation TEXT NOT NULL,workspace_id TEXT NOT NULL,key TEXT NOT NULL,title_fold TEXT NOT NULL,text_fold TEXT NOT NULL,tokens TEXT NOT NULL,document_json TEXT NOT NULL,UNIQUE(scope,generation,key));
CREATE INDEX search_record_generation ON search_record_text(generation);
CREATE VIRTUAL TABLE search_record_fts USING fts5(tokens,tokenize='unicode61 remove_diacritics 0');
CREATE TRIGGER search_record_fts_insert AFTER INSERT ON search_record_text BEGIN INSERT INTO search_record_fts(rowid,tokens) VALUES(NEW.rowid,NEW.tokens); END;
CREATE TRIGGER search_record_fts_delete AFTER DELETE ON search_record_text BEGIN DELETE FROM search_record_fts WHERE rowid=OLD.rowid; END;
CREATE TRIGGER search_record_fts_update AFTER UPDATE ON search_record_text BEGIN DELETE FROM search_record_fts WHERE rowid=OLD.rowid; INSERT INTO search_record_fts(rowid,tokens) VALUES(NEW.rowid,NEW.tokens); END;
-- ACL membership/grants/policy changes already advance core_acl_epoch. These
-- canonical dependencies also invalidate computed values, including transitive
-- relations, field definitions, published targets, deleted files and tree changes.
CREATE TRIGGER search_record_dependency_pages_insert AFTER INSERT ON pages BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_pages_update AFTER UPDATE ON pages BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_pages_delete AFTER DELETE ON pages BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_blocks_insert AFTER INSERT ON page_blocks BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_blocks_update AFTER UPDATE ON page_blocks BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_blocks_delete AFTER DELETE ON page_blocks BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_revisions_insert AFTER INSERT ON page_revisions BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_revisions_update AFTER UPDATE ON page_revisions BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_revisions_delete AFTER DELETE ON page_revisions BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_contributors_insert AFTER INSERT ON page_contributors BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_contributors_update AFTER UPDATE ON page_contributors BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_contributors_delete AFTER DELETE ON page_contributors BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_verifications_insert AFTER INSERT ON page_verifications BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_verifications_update AFTER UPDATE ON page_verifications BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_page_verifications_delete AFTER DELETE ON page_verifications BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_database_records_insert AFTER INSERT ON database_records BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_database_records_update AFTER UPDATE ON database_records BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_database_records_delete AFTER DELETE ON database_records BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_database_fields_insert AFTER INSERT ON database_fields BEGIN
 UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1;
 INSERT INTO search_dirty SELECT 'record:'||p.id,p.workspace_id,hex(randomblob(16)) FROM database_records d JOIN pages p ON p.id=d.page_id WHERE d.database_id=NEW.database_id AND p.page_kind='record' ON CONFLICT(key) DO UPDATE SET generation=excluded.generation;
END;
CREATE TRIGGER search_record_dependency_database_fields_update AFTER UPDATE ON database_fields BEGIN
 UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1;
 INSERT INTO search_dirty SELECT 'record:'||p.id,p.workspace_id,hex(randomblob(16)) FROM database_records d JOIN pages p ON p.id=d.page_id WHERE d.database_id IN (OLD.database_id,NEW.database_id) AND p.page_kind='record' ON CONFLICT(key) DO UPDATE SET generation=excluded.generation;
END;
CREATE TRIGGER search_record_dependency_database_fields_delete AFTER DELETE ON database_fields BEGIN
 UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1;
 INSERT INTO search_dirty SELECT 'record:'||p.id,p.workspace_id,hex(randomblob(16)) FROM database_records d JOIN pages p ON p.id=d.page_id WHERE d.database_id=OLD.database_id AND p.page_kind='record' ON CONFLICT(key) DO UPDATE SET generation=excluded.generation;
END;
CREATE TRIGGER search_record_dependency_databases_insert AFTER INSERT ON databases BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_databases_update AFTER UPDATE ON databases BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_databases_delete AFTER DELETE ON databases BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_files_insert AFTER INSERT ON files BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_files_update AFTER UPDATE ON files BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_files_delete AFTER DELETE ON files BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_containers_insert AFTER INSERT ON containers BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_containers_update AFTER UPDATE ON containers BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_containers_delete AFTER DELETE ON containers BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_content_archive_locations_insert AFTER INSERT ON content_archive_locations BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_content_archive_locations_update AFTER UPDATE ON content_archive_locations BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
CREATE TRIGGER search_record_dependency_content_archive_locations_delete AFTER DELETE ON content_archive_locations BEGIN UPDATE search_record_epoch SET epoch=epoch+1 WHERE id=1; END;
