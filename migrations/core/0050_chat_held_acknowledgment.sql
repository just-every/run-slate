-- Acknowledging an uncertain send never changes its dispatch fence or receipt.
ALTER TABLE chat_deliveries ADD COLUMN acknowledged_at TEXT;
