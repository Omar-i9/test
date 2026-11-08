PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_create_tactical_plan_library.sql','2026-11-04 18:49:32');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0002_cloud_sync_engine.sql','2026-11-05 21:32:48');
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE tactical_plans (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
  user_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('5v5', '7v7')),
  slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 5),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 70),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  payload_json TEXT NOT NULL
    CHECK (length(CAST(payload_json AS BLOB)) <= 262144)
    CHECK (json_valid(payload_json))
    CHECK (json_extract(payload_json, '$.schemaVersion') = schema_version)
    CHECK (json_extract(payload_json, '$.id') = id)
    CHECK (json_extract(payload_json, '$.metadata.gameFormat') = format)
    CHECK (json_extract(payload_json, '$.metadata.title') = title),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE sync_records (
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
CREATE TABLE sync_cursor_state (
  user_id TEXT PRIMARY KEY NOT NULL,
  last_cursor INTEGER NOT NULL CHECK (last_cursor BETWEEN 1 AND 9007199254740991),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE TABLE sync_changes (
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
CREATE TABLE sync_operations (
  user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 8 AND 120),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  result_json TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, operation_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (result_json IS NULL OR (length(CAST(result_json AS BLOB)) <= 2048 AND json_valid(result_json)))
) WITHOUT ROWID;
CREATE TABLE sync_rate_limits (
  user_id TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL CHECK (window_start >= 0),
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 60),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) WITHOUT ROWID;
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',2);
CREATE UNIQUE INDEX uq_tactical_plans_active_slot
  ON tactical_plans(user_id, format, slot_number)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tactical_plans_owner_format_updated
  ON tactical_plans(user_id, format, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tactical_plans_owner_updated
  ON tactical_plans(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_sync_records_owner_type_updated
  ON sync_records(user_id, entity_type, updated_at DESC);
CREATE INDEX idx_sync_operations_created
  ON sync_operations(user_id, created_at DESC);
