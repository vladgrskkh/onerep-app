import { describe, expect, it } from '@jest/globals';

import { SCHEMA_SQL, SYNC_TABLES } from '../schema';

describe('SCHEMA_SQL', () => {
  it('creates all tables', () => {
    for (const table of [
      'exercises',
      'templates',
      'workouts',
      'body_weights',
      'sync_state',
      'progress_cache',
    ]) {
      expect(SCHEMA_SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('adds sync columns (is_dirty, operation, last_synced_at) to every sync table', () => {
    for (const table of SYNC_TABLES) {
      const start = SCHEMA_SQL.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`);
      const end = SCHEMA_SQL.indexOf(');', start);
      const ddl = SCHEMA_SQL.slice(start, end);
      expect(ddl).toContain('is_dirty INTEGER NOT NULL DEFAULT 0');
      expect(ddl).toContain('operation TEXT');
      expect(ddl).toContain('last_synced_at TEXT');
    }
  });

  it('stores nested children of exercises as JSON text columns', () => {
    expect(SCHEMA_SQL).toContain('media TEXT');
    expect(SCHEMA_SQL).toContain('muscle_groups TEXT');
  });

  it('adds a client_id column to the re-keyed sync tables', () => {
    for (const table of ['exercises', 'templates', 'workouts']) {
      const start = SCHEMA_SQL.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`);
      const end = SCHEMA_SQL.indexOf(');', start);
      const ddl = SCHEMA_SQL.slice(start, end);
      expect(ddl).toContain('client_id TEXT');
      expect(SCHEMA_SQL).toContain(`CREATE INDEX IF NOT EXISTS idx_${table}_client_id ON ${table} (client_id)`);
    }
  });

  it('stores nested children of templates and workouts as JSON text columns', () => {
    expect(SCHEMA_SQL).toMatch(/templates[\s\S]*exercises TEXT/);
    expect(SCHEMA_SQL).toMatch(/templates[\s\S]*media TEXT/);
    expect(SCHEMA_SQL).toMatch(/workouts[\s\S]*exercises TEXT/);
  });

  it('indexes (updated_at) and (is_dirty) on every sync table', () => {
    for (const table of SYNC_TABLES) {
      expect(SCHEMA_SQL).toContain(`CREATE INDEX IF NOT EXISTS idx_${table}_updated_at ON ${table} (updated_at)`);
      expect(SCHEMA_SQL).toContain(`CREATE INDEX IF NOT EXISTS idx_${table}_is_dirty ON ${table} (is_dirty)`);
    }
  });

  it('gives each table an id TEXT primary key', () => {
    expect(SCHEMA_SQL.match(/id TEXT PRIMARY KEY NOT NULL/g)).toHaveLength(
      SYNC_TABLES.length,
    );
  });
});
