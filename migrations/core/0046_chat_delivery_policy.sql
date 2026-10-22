-- Preserve all c7a columns, IDs, ciphertext scopes and receipts in place.
-- The legacy provider CHECK remains intact; notifier_provider extends the protocol.
ALTER TABLE chat_connections ADD COLUMN notifier_provider TEXT CHECK(notifier_provider IN ('slack','teams','nook'));
ALTER TABLE chat_connections ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'immediate' CHECK(delivery_mode IN ('immediate','daily'));
ALTER TABLE chat_connections ADD COLUMN retry_after TEXT;
ALTER TABLE chat_deliveries ADD COLUMN message_id TEXT;
CREATE TABLE chat_messages (
 id TEXT PRIMARY KEY,
 connection_id TEXT NOT NULL REFERENCES chat_connections(id),
 destination TEXT NOT NULL,
 provider_receipt TEXT,
 thread_receipt TEXT,
 state TEXT NOT NULL CHECK(state IN ('prepared','sent','withdraw','restricted','uncertain')),
 created_at TEXT NOT NULL,
 next_attempt_at TEXT,
 failure TEXT
);
CREATE TABLE chat_message_sources (
 message_id TEXT NOT NULL REFERENCES chat_messages(id),
 outbox_id TEXT NOT NULL REFERENCES notification_outbox(id),
 page_id TEXT,
 actor_member_id TEXT,
 PRIMARY KEY(message_id,outbox_id)
);
CREATE INDEX chat_messages_destination ON chat_messages(connection_id,created_at);
CREATE INDEX chat_message_sources_page ON chat_message_sources(page_id);
CREATE INDEX chat_message_sources_actor ON chat_message_sources(actor_member_id);
-- Recover known legacy messages without retaining their titles or bodies.
INSERT INTO chat_messages(id,connection_id,destination,provider_receipt,state,created_at)
 SELECT d.id,d.connection_id,CASE WHEN json_valid(d.provider_receipt) AND json_type(d.provider_receipt,'$.channel')='text' THEN c.provider||':'||json_extract(d.provider_receipt,'$.channel') ELSE c.destination END,d.provider_receipt,'sent',COALESCE(d.delivered_at,d.created_at)
 FROM chat_deliveries d JOIN chat_connections c ON c.id=d.connection_id WHERE d.state='delivered' AND d.provider_receipt IS NOT NULL;
INSERT INTO chat_message_sources(message_id,outbox_id,page_id,actor_member_id)
 SELECT d.id,d.outbox_id,o.page_id,o.actor_member_id FROM chat_deliveries d
 JOIN chat_messages m ON m.id=d.id JOIN notification_outbox o ON o.id=d.outbox_id;
UPDATE chat_deliveries SET message_id=id WHERE id IN (SELECT id FROM chat_messages);
