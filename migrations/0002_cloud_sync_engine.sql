-- TAAMEN V18 — account-owned structured cloud records and compact incremental sync index.
-- Additive only: retains the V17 users/tactical_plans tables and every existing record.
-- No R2/object storage is provisioned; V18 stores bounded JSON/text records in D1.

CREATE TABLE IF NOT EXISTS sync_records (
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('profile', 'match')),
  entity_id TEXT NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 120),
  payload_json TEXT NOT NULL
    CHECK (length(CAST(payload_json AS BLOB)) <= 65536)
    CHECK (json_valid(payload_json))
    CHECK (json_type(payload_json) = 'object')
    CHECK (entity_type <> 'profile' OR entity_id = 'current')
    CHECK (entity_type <> 'match' OR json_extract(payload_json, '$.id') = entity_id),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 2147483647),
  last_operation_id TEXT NOT NULL CHECK (length(last_operation_id) BETWEEN 8 AND 120),
  last_operation_hash TEXT NOT NULL CHECK (length(last_operation_hash) = 64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (user_id, entity_type, entity_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_sync_records_owner_type_updated
  ON sync_records(user_id, entity_type, updated_at DESC);

-- Each account has its own monotonically increasing cursor; gaps cannot reveal other users' activity.
CREATE TABLE IF NOT EXISTS sync_cursor_state (
  user_id TEXT PRIMARY KEY NOT NULL,
  last_cursor INTEGER NOT NULL CHECK (last_cursor BETWEEN 1 AND 9007199254740991),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) WITHOUT ROWID;

-- Compact account-scoped change index: only the latest cursor row per entity is kept.
-- This bounds journal growth to the number of synchronized entities, not edit history.
CREATE TABLE IF NOT EXISTS sync_changes (
  user_id TEXT NOT NULL,
  cursor INTEGER NOT NULL CHECK (cursor BETWEEN 1 AND 9007199254740991),
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 8 AND 120),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('profile', 'match')),
  entity_id TEXT NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 120),
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 2147483647),
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  changed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, cursor),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, entity_type, entity_id)
) WITHOUT ROWID;


-- Idempotency results are short-lived metadata, not copies of record payloads.
-- Worker retention is 30 days; the record stores its last operation hash for safe late retries.
CREATE TABLE IF NOT EXISTS sync_operations (
  user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 8 AND 120),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  result_json TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, operation_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (result_json IS NULL OR (length(CAST(result_json AS BLOB)) <= 2048 AND json_valid(result_json)))
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_sync_operations_created
  ON sync_operations(user_id, created_at DESC);


-- Per-account fixed-window request guard for sync endpoints (push + pull).
CREATE TABLE IF NOT EXISTS sync_rate_limits (
  user_id TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL CHECK (window_start >= 0),
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 60),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) WITHOUT ROWID;
