-- Current configuration remains in the portable immutable entity revision history.
-- Explicit sequence ordering survives wall-clock skew and archive row reordering.
CREATE INDEX core_configuration_current ON core_entity_revisions (
  workspace_id, entity_kind, entity_id,
  CAST(json_extract(content_json,'$.configurationSequence') AS INTEGER) DESC, id DESC
) WHERE entity_kind IN ('sharing-configuration','navigation-configuration');
