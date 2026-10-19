CREATE TABLE import_door_native_targets (destination TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL, value_json TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(destination,kind,target_id));
CREATE TRIGGER import_door_native_insert AFTER INSERT ON import_door_native_targets BEGIN UPDATE import_native_epoch SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER import_door_native_update AFTER UPDATE ON import_door_native_targets BEGIN UPDATE import_native_epoch SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER import_door_native_delete AFTER DELETE ON import_door_native_targets BEGIN UPDATE import_native_epoch SET revision=revision+1 WHERE id=1; END;
