CREATE TABLE database_forms (
 id TEXT PRIMARY KEY NOT NULL,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 database_id TEXT NOT NULL UNIQUE REFERENCES databases(id),
 slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 definition_json TEXT NOT NULL,
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
 publisher_member_id TEXT REFERENCES members(id),
 revision_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE database_form_submissions (
 form_id TEXT NOT NULL REFERENCES database_forms(id),
 submission_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 record_id TEXT REFERENCES pages(id),
 submitter_member_id TEXT REFERENCES members(id),
 submitter_kind TEXT NOT NULL CHECK(submitter_kind IN ('member','guest','anonymous','former-member')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(form_id,submission_key)
);
CREATE INDEX database_form_submissions_record ON database_form_submissions(record_id);
CREATE TRIGGER import_native_database_forms_insert AFTER INSERT ON database_forms BEGIN INSERT INTO import_native_epoch(id,revision,seal) VALUES(1,1,NULL) ON CONFLICT(id) DO UPDATE SET revision=revision+1,seal=NULL; END;
CREATE TRIGGER import_native_database_forms_update AFTER UPDATE ON database_forms BEGIN INSERT INTO import_native_epoch(id,revision,seal) VALUES(1,1,NULL) ON CONFLICT(id) DO UPDATE SET revision=revision+1,seal=NULL; END;
CREATE TRIGGER import_native_database_forms_delete AFTER DELETE ON database_forms BEGIN INSERT INTO import_native_epoch(id,revision,seal) VALUES(1,1,NULL) ON CONFLICT(id) DO UPDATE SET revision=revision+1,seal=NULL; END;
CREATE TRIGGER import_native_database_form_submissions_insert AFTER INSERT ON database_form_submissions BEGIN INSERT INTO import_native_epoch(id,revision,seal) VALUES(1,1,NULL) ON CONFLICT(id) DO UPDATE SET revision=revision+1,seal=NULL; END;
CREATE TRIGGER import_native_database_form_submissions_update AFTER UPDATE ON database_form_submissions BEGIN INSERT INTO import_native_epoch(id,revision,seal) VALUES(1,1,NULL) ON CONFLICT(id) DO UPDATE SET revision=revision+1,seal=NULL; END;
CREATE TRIGGER import_native_database_form_submissions_delete AFTER DELETE ON database_form_submissions BEGIN INSERT INTO import_native_epoch(id,revision,seal) VALUES(1,1,NULL) ON CONFLICT(id) DO UPDATE SET revision=revision+1,seal=NULL; END;
