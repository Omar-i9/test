-- TAAMEN V17 — account-owned tactical plan storage foundation.
-- This migration is intentionally additive and must be applied to a new preview D1
-- database first. It does not alter KV, Durable Objects, AI quota, or local IndexedDB.

-- D1 enforces foreign keys by default for each query and migration.
-- Do not issue PRAGMA foreign_keys here: D1 executes migrations transactionally.

-- Identity rows are created by the future verified account/session flow (V19).
-- V17 deliberately does not create public or anonymous users.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tactical_plans (
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

-- Soft-deleted rows are retained as tombstones, but their slots become available again.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tactical_plans_active_slot
  ON tactical_plans(user_id, format, slot_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tactical_plans_owner_format_updated
  ON tactical_plans(user_id, format, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tactical_plans_owner_updated
  ON tactical_plans(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
