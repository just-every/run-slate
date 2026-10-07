"""Retained 0001 structured records survive the additive 0004 migration."""
import pathlib
import sqlite3
import json
root = pathlib.Path(__file__).resolve().parents[3]
db = sqlite3.connect(':memory:')
db.executescript(next((root/'migrations/core').glob('0001*.sql')).read_text())
db.executescript("""
INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('w','Retained','R','t','t','wr');
INSERT INTO members(id,workspace_id,email,display_name,initials,role,created_at,updated_at) VALUES('m','w','retained@example.invalid','Owner','O','owner','t','t');
INSERT INTO containers(id,workspace_id,name,created_at,updated_at,revision_id) VALUES('c','w','Retained','t','t','cr');
INSERT INTO pages(id,workspace_id,container_id,title,author_member_id,working_revision_id,created_at,updated_at,revision_id) VALUES('p','w','c','Database','m','pr','t','t','pr');
INSERT INTO pages(id,workspace_id,container_id,title,author_member_id,working_revision_id,created_at,updated_at,revision_id) VALUES('r','w','c','Retained record','m','rr','t','t','rr');
INSERT INTO databases(id,page_id,workspace_id,created_at,updated_at,revision_id) VALUES('d','p','w','t','t','dr');
INSERT INTO database_fields(id,database_id,name,field_type,position,created_at,updated_at,revision_id) VALUES('f','d','Original','text',0,'t','t','fr');
INSERT INTO database_records(page_id,database_id,field_values_json,created_at,updated_at) VALUES('r','d','{"f":"retained original bytes"}','t','t');
""")
db.executescript((root/'migrations/core/0004_structured_work.sql').read_text())
row = db.execute('SELECT field_values_json,revision_id FROM database_records WHERE page_id=?',('r',)).fetchone()
assert json.loads(row[0]) == {'f':'retained original bytes'}
assert row[1] == 'rr'
assert db.execute('PRAGMA foreign_key_check').fetchall() == []
assert db.execute('SELECT name FROM database_fields WHERE id=?',('f',)).fetchone()[0] == 'Original'
print('PASS: retained 0001 values, field definitions and page revision identity; zero foreign-key violations.')
