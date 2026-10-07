-- Existing schedules retain their original no-location/no-access-change semantics.
ALTER TABLE content_schedules ADD COLUMN publication_json TEXT;
-- Removal is an attention/delivery revocation, including an outbox already read by a worker.
CREATE TRIGGER core_acl_decision_removal_update AFTER UPDATE OF removed_at ON knowledge_decisions
BEGIN UPDATE core_acl_epoch SET epoch=epoch+1 WHERE id=1; END;
