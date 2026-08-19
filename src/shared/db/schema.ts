export const SYNC_TABLES = ['exercises', 'templates', 'workouts', 'body_weights'] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

export const SYNC_COLUMNS_DDL = `
  is_dirty INTEGER NOT NULL DEFAULT 0,
  operation TEXT,
  last_synced_at TEXT
`;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  media TEXT,
  muscle_groups TEXT,
${SYNC_COLUMNS_DDL}
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  exercises TEXT,
  media TEXT,
${SYNC_COLUMNS_DDL}
);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT,
  user_id TEXT NOT NULL,
  template_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  notes TEXT,
  exercises TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
${SYNC_COLUMNS_DDL}
);

CREATE TABLE IF NOT EXISTS body_weights (
  id TEXT PRIMARY KEY NOT NULL,
  weight_kg REAL NOT NULL,
  measured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
${SYNC_COLUMNS_DDL}
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

-- Local-only cache for server-computed progress payloads (1RM, volume) that
-- the sync engine does not pull; screens write fresh API responses here and
-- fall back to the cache when offline.
CREATE TABLE IF NOT EXISTS progress_cache (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exercises_updated_at ON exercises (updated_at);
CREATE INDEX IF NOT EXISTS idx_exercises_is_dirty ON exercises (is_dirty);
CREATE INDEX IF NOT EXISTS idx_exercises_client_id ON exercises (client_id);
CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON templates (updated_at);
CREATE INDEX IF NOT EXISTS idx_templates_is_dirty ON templates (is_dirty);
CREATE INDEX IF NOT EXISTS idx_templates_client_id ON templates (client_id);
CREATE INDEX IF NOT EXISTS idx_workouts_updated_at ON workouts (updated_at);
CREATE INDEX IF NOT EXISTS idx_workouts_is_dirty ON workouts (is_dirty);
CREATE INDEX IF NOT EXISTS idx_workouts_client_id ON workouts (client_id);
CREATE INDEX IF NOT EXISTS idx_body_weights_updated_at ON body_weights (updated_at);
CREATE INDEX IF NOT EXISTS idx_body_weights_is_dirty ON body_weights (is_dirty);
`;
