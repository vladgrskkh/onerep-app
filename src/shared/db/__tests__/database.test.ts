import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { BodyWeightEntry, Exercise, Template, Workout } from '../../api/gym';
import {
  LocalDb,
  dirtyRowsSql,
  exerciseToRaw,
  mapBodyWeightRow,
  mapExerciseRow,
  mapTemplateRow,
  mapWorkoutRow,
  templateToRaw,
  workoutToRaw,
  type ExerciseRawRow,
  type SqlConnection,
  type SqlParam,
  type TemplateRawRow,
} from '../database';
import { SCHEMA_SQL, type SyncTable } from '../schema';

type Mock = jest.Mock<(...args: any[]) => any>;

function makeConnection(overrides: Partial<SqlConnection> = {}): SqlConnection {
  return {
    execSync: jest.fn(),
    runSync: jest.fn(() => ({ changes: 1 })),
    getFirstSync: jest.fn(() => null),
    getAllSync: jest.fn(() => []),
    ...overrides,
  } as unknown as SqlConnection;
}

const exercise: Exercise = {
  id: 'e1',
  name: 'Squat',
  description: 'Barbell squat',
  is_built_in: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  version: 3,
  media: [
    { id: 'm1', media_type: 'photo', sort_order: 0, s3_key: 'media/e1/p.jpg' },
  ],
  muscle_groups: [{ id: 1, is_primary: true }],
};

const template: Template = {
  id: 't1',
  name: 'Push day',
  is_public: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  version: 1,
  exercises: [{ exercise_id: 'e1', sort_order: 0, planned_sets: 5 }],
  media: [{ id: 'm1', media_type: 'photo', sort_order: 0, s3_key: 'media/t1/p.jpg' }],
};

const workout: Workout = {
  id: 'w1',
  user_id: 'u1',
  template_id: 't1',
  started_at: '2026-01-01T08:00:00Z',
  notes: 'Heavy',
  created_at: '2026-01-01T08:00:00Z',
  updated_at: '2026-01-01T09:00:00Z',
  exercises: [
    {
      id: 'we1',
      exercise_id: 'e1',
      sort_order: 0,
      sets: [
        { id: 's1', set_number: 1, weight_kg: 100, reps: 5, is_warmup: false },
      ],
    },
  ],
};

const bodyWeight: BodyWeightEntry = {
  id: 'bw1',
  weight_kg: 82.5,
  measured_at: '2026-01-01T08:00:00Z',
  created_at: '2026-01-01T08:00:00Z',
};

describe('row mappers', () => {
  it('mapExerciseRow parses JSON children and integer booleans', () => {
    const raw: ExerciseRawRow = {
      id: 'e1',
      client_id: 'client-e1',
      name: 'Squat',
      description: null,
      notes: null,
      is_built_in: 0,
      created_by_user_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
      version: 3,
      media: JSON.stringify(exercise.media),
      muscle_groups: JSON.stringify(exercise.muscle_groups),
      is_dirty: 0,
      operation: null,
      last_synced_at: null,
    };
    const mapped = mapExerciseRow(raw);
    expect(mapped.is_built_in).toBe(false);
    expect(mapped.media).toEqual(exercise.media);
    expect(mapped.muscle_groups).toEqual(exercise.muscle_groups);
    expect(mapped.client_id).toBe('client-e1');
  });

  it('mapExerciseRow treats null JSON children as undefined', () => {
    const mapped = mapExerciseRow({
      id: 'e1',
      client_id: null,
      name: 'Squat',
      description: null,
      notes: null,
      is_built_in: 1,
      created_by_user_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
      version: 1,
      media: null,
      muscle_groups: null,
      is_dirty: 0,
      operation: null,
      last_synced_at: null,
    });
    expect(mapped.media).toBeUndefined();
    expect(mapped.muscle_groups).toBeUndefined();
  });

  it('mapTemplateRow parses exercises and media JSON', () => {
    const raw = {
      id: 't1',
      client_id: 'client-t1',
      name: 'Push day',
      description: null,
      is_public: 0,
      created_by_user_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
      version: 1,
      exercises: JSON.stringify(template.exercises),
      media: JSON.stringify(template.media),
      is_dirty: 1,
      operation: 'create',
      last_synced_at: null,
    } satisfies TemplateRawRow;
    const mapped = mapTemplateRow(raw);
    expect(mapped.exercises).toEqual(template.exercises);
    expect(mapped.media).toEqual(template.media);
    expect(mapped.operation).toBe('create');
    expect(mapped.client_id).toBe('client-t1');
  });

  it('mapWorkoutRow parses exercises with nested sets', () => {
    const raw = {
      id: 'w1',
      client_id: null,
      user_id: 'u1',
      template_id: null,
      started_at: '2026-01-01T08:00:00Z',
      finished_at: null,
      notes: null,
      exercises: JSON.stringify(workout.exercises),
      created_at: '2026-01-01T08:00:00Z',
      updated_at: '2026-01-01T09:00:00Z',
      version: 0,
      is_dirty: 0,
      operation: null,
      last_synced_at: '2026-01-01T09:00:00Z',
    };
    const mapped = mapWorkoutRow(raw);
    expect(mapped.exercises).toEqual(workout.exercises);
  });

  it('mapBodyWeightRow keeps weight_kg numeric', () => {
    const mapped = mapBodyWeightRow({
      id: 'bw1',
      weight_kg: 82.5,
      measured_at: '2026-01-01T08:00:00Z',
      created_at: '2026-01-01T08:00:00Z',
      updated_at: '2026-01-01T08:00:00Z',
      is_dirty: 0,
      operation: null,
      last_synced_at: null,
    });
    expect(mapped.weight_kg).toBe(82.5);
    expect(mapped.id).toBe('bw1');
  });
});

describe('raw converters', () => {
  it('exerciseToRaw stringifies JSON children and defaults sync columns to clean', () => {
    const raw = exerciseToRaw(exercise);
    expect(raw.media).toBe(JSON.stringify(exercise.media));
    expect(raw.muscle_groups).toBe(JSON.stringify(exercise.muscle_groups));
    expect(raw.is_dirty).toBe(0);
    expect(raw.operation).toBeNull();
    expect(raw.last_synced_at).toBeNull();
  });

  it('exerciseToRaw accepts explicit sync overrides', () => {
    const raw = exerciseToRaw(exercise, { is_dirty: 1, operation: 'create' });
    expect(raw.is_dirty).toBe(1);
    expect(raw.operation).toBe('create');
  });

  it('exerciseToRaw defaults client_id to null and accepts an explicit one', () => {
    expect(exerciseToRaw(exercise).client_id).toBeNull();
    expect(exerciseToRaw(exercise, {}, 'client-e1').client_id).toBe('client-e1');
  });

  it('templateToRaw and workoutToRaw stringify their JSON children', () => {
    expect(templateToRaw(template).exercises).toBe(JSON.stringify(template.exercises));
    expect(workoutToRaw(workout).exercises).toBe(JSON.stringify(workout.exercises));
  });
});

describe('dirtyRowsSql', () => {
  it('builds an ordered select for a whitelisted table', () => {
    expect(dirtyRowsSql('exercises')).toBe(
      'SELECT * FROM exercises WHERE is_dirty = 1 ORDER BY created_at ASC, id ASC',
    );
  });

  it('rejects unknown table names', () => {
    expect(() => dirtyRowsSql('users' as SyncTable)).toThrow();
  });
});

describe('LocalDb', () => {
  let conn: SqlConnection;

  beforeEach(() => {
    conn = makeConnection();
  });

  function mockConn(): Record<string, Mock> {
    return conn as unknown as Record<string, Mock>;
  }

  it('init executes the schema', () => {
    const db = new LocalDb(conn);
    db.init();
    expect(mockConn().execSync).toHaveBeenCalledWith(SCHEMA_SQL);
  });

  it('getDirtyRows returns mapped typed rows', () => {
    mockConn().getAllSync.mockReturnValue([
      {
        id: 'e1',
        name: 'Squat',
        description: null,
        notes: null,
        is_built_in: 0,
        created_by_user_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        version: 3,
        media: JSON.stringify(exercise.media),
        muscle_groups: JSON.stringify(exercise.muscle_groups),
        is_dirty: 1,
        operation: 'create',
        last_synced_at: null,
      },
    ]);
    const db = new LocalDb(conn);
    const rows = db.getDirtyRows('exercises');
    expect(mockConn().getAllSync).toHaveBeenCalledWith(dirtyRowsSql('exercises'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'e1',
      operation: 'create',
      is_dirty: 1,
      media: exercise.media,
      is_built_in: false,
    });
  });

  it('getDirtyRows rejects unknown tables', () => {
    const db = new LocalDb(conn);
    expect(() => db.getDirtyRows('users' as SyncTable)).toThrow();
    expect(mockConn().getAllSync).not.toHaveBeenCalled();
  });

  it('isDirtyRow reads the is_dirty flag for a row', () => {
    mockConn().getFirstSync.mockReturnValue({ is_dirty: 1 });
    const db = new LocalDb(conn);
    expect(db.isDirtyRow('templates', 't1')).toBe(true);
    expect(mockConn().getFirstSync).toHaveBeenCalledWith(
      'SELECT is_dirty FROM templates WHERE id = ?',
      't1',
    );
  });

  it('markSynced clears sync flags and stores server fields', () => {
    const db = new LocalDb(conn);
    db.markSynced('exercises', 'e1', exercise);
    const run = mockConn().runSync;
    expect(run).toHaveBeenCalledTimes(1);
    const [sql, ...params] = run.mock.calls[0] as [string, ...SqlParam[]];
    expect(sql).toContain('UPDATE exercises SET');
    expect(sql).toContain('is_dirty = 0');
    expect(sql).toContain('operation = NULL');
    expect(params).toEqual([
      'Squat',
      'Barbell squat',
      null,
      0,
      null,
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      3,
      JSON.stringify(exercise.media),
      JSON.stringify(exercise.muscle_groups),
      '2026-01-02T00:00:00Z',
      'e1',
    ]);
  });

  it('markSynced re-keys a locally created row to the server id and carries client_id', () => {
    const db = new LocalDb(conn);
    mockConn().getFirstSync.mockReturnValue({
      id: 'local-e1',
      client_id: 'client-e1',
      name: 'Squat',
      description: null,
      notes: null,
      is_built_in: 0,
      created_by_user_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      version: 1,
      media: null,
      muscle_groups: null,
      is_dirty: 1,
      operation: 'create',
      last_synced_at: null,
    });
    db.markSynced('exercises', 'local-e1', { ...exercise, id: 'server-e1' });
    const run = mockConn().runSync;
    const insert = run.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO exercises'));
    expect(insert).toBeDefined();
    const deleteCall = run.mock.calls.find(([sql]) => String(sql).startsWith('DELETE FROM exercises'));
    expect(deleteCall).toBeDefined();
    const params = insert as unknown[];
    expect(params[1]).toBe('server-e1');
    // client_id rides along in the INSERT so the re-keyed server row stays
    // resolvable by the client-generated id.
    expect(params).toContain('client-e1');
  });

  it('markSynced re-key falls back to the local id when the row has no client_id', () => {
    const db = new LocalDb(conn);
    mockConn().getFirstSync.mockReturnValue(null);
    db.markSynced('exercises', 'local-e1', { ...exercise, id: 'server-e1' });
    const run = mockConn().runSync;
    const insert = run.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO exercises'));
    expect(insert as unknown[]).toContain('local-e1');
  });

  it('upsertRemote uses conflict-clause protected by is_dirty = 0 and preserves client_id', () => {
    const db = new LocalDb(conn);
    db.upsertRemote('exercises', exercise);
    const run = mockConn().runSync;
    const [sql] = run.mock.calls[0] as [string];
    expect(sql).toContain('INSERT INTO exercises');
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE SET');
    expect(sql).toContain('WHERE is_dirty = 0');
    expect(sql).toContain('operation = NULL');
    expect(sql).toContain(
      'client_id = CASE WHEN excluded.client_id IS NULL THEN client_id ELSE excluded.client_id END',
    );
  });

  it('removeRow deletes by id', () => {
    const db = new LocalDb(conn);
    db.removeRow('workouts', 'w1');
    expect(mockConn().runSync).toHaveBeenCalledWith('DELETE FROM workouts WHERE id = ?', 'w1');
  });

  it('setLastSyncedAt upserts into sync_state and getLastSyncedAt reads it back', () => {
    const db = new LocalDb(conn);
    db.setLastSyncedAt('2026-01-02T00:00:00Z');
    expect(mockConn().runSync).toHaveBeenCalledWith(
      "INSERT INTO sync_state (key, value) VALUES ('last_synced_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      '2026-01-02T00:00:00Z',
    );

    mockConn().getFirstSync.mockReturnValue({ value: '2026-01-02T00:00:00Z' });
    expect(db.getLastSyncedAt()).toBe('2026-01-02T00:00:00Z');
    expect(mockConn().getFirstSync).toHaveBeenCalledWith(
      "SELECT value FROM sync_state WHERE key = 'last_synced_at'",
    );
  });

  it('getLastSyncedAt returns null when no state stored', () => {
    const db = new LocalDb(conn);
    expect(db.getLastSyncedAt()).toBeNull();
  });

  it('clears all account-private cache tables and advances the data generation', () => {
    const db = new LocalDb(conn);

    expect(db.getDataGeneration()).toBe(0);

    db.clearPrivateData();

    expect(mockConn().execSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM exercises;'),
    );
    const purgeSql = mockConn().execSync.mock.calls[0][0] as string;
    for (const table of ['templates', 'workouts', 'body_weights', 'progress_cache', 'sync_state']) {
      expect(purgeSql).toContain(`DELETE FROM ${table};`);
    }
    expect(db.getDataGeneration()).toBe(1);
  });

  it('setProgressCache upserts a JSON payload and getProgressCache reads it back', () => {
    const db = new LocalDb(conn);
    db.setProgressCache('progress:1rm:e1', '[{"date":"2026-01-01","estimated_1rm":100}]');

    expect(mockConn().runSync).toHaveBeenCalledWith(
      'INSERT INTO progress_cache (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      'progress:1rm:e1',
      '[{"date":"2026-01-01","estimated_1rm":100}]',
      expect.any(String),
    );

    mockConn().getFirstSync.mockReturnValue({ value: '[{"estimated_1rm":100}]' });
    expect(db.getProgressCache('progress:1rm:e1')).toBe('[{"estimated_1rm":100}]');
    expect(mockConn().getFirstSync).toHaveBeenCalledWith(
      'SELECT value FROM progress_cache WHERE key = ?',
      'progress:1rm:e1',
    );
  });

  it('getProgressCache returns null when nothing is cached', () => {
    const db = new LocalDb(conn);
    expect(db.getProgressCache('progress:volume')).toBeNull();
  });

  it('upsertBodyWeight serializes a weight entry and marks it dirty on create', () => {
    const db = new LocalDb(conn);
    db.upsertBodyWeight(bodyWeight, { is_dirty: 1, operation: 'create' });
    const run = mockConn().runSync;
    const [sql, ...params] = run.mock.calls[0] as [string, ...SqlParam[]];
    expect(sql).toContain('INSERT INTO body_weights');
    expect(params.slice(0, 4)).toEqual(['bw1', 82.5, '2026-01-01T08:00:00Z', '2026-01-01T08:00:00Z']);
    expect(params[params.length - 3]).toBe(1);
    expect(params[params.length - 2]).toBe('create');
  });

  it('upsertExercise stores client_id next to the sync columns', () => {
    const db = new LocalDb(conn);
    db.upsertExercise(exercise, { is_dirty: 1, operation: 'create', client_id: 'client-e1' });
    const run = mockConn().runSync;
    const [sql, ...params] = run.mock.calls[0] as [string, ...SqlParam[]];
    expect(sql).toContain('client_id');
    expect(sql).toContain(
      'client_id = CASE WHEN excluded.client_id IS NULL THEN client_id ELSE excluded.client_id END',
    );
    expect(params[params.length - 4]).toBe('client-e1');
  });

  it('findWorkoutByClientID resolves a row by its stable client_id handle', () => {
    const db = new LocalDb(conn);
    mockConn().getFirstSync.mockReturnValue({
      id: 'w1',
      client_id: 'client-w1',
      user_id: 'u1',
      template_id: null,
      started_at: '2026-01-01T08:00:00Z',
      finished_at: null,
      notes: null,
      exercises: null,
      created_at: '2026-01-01T08:00:00Z',
      updated_at: '2026-01-01T08:00:00Z',
      version: 0,
      is_dirty: 0,
      operation: null,
      last_synced_at: null,
    });
    const row = db.findWorkoutByClientID('client-w1');
    expect(mockConn().getFirstSync).toHaveBeenCalledWith(
      'SELECT * FROM workouts WHERE client_id = ?',
      'client-w1',
    );
    expect(row?.id).toBe('w1');
    expect(row?.client_id).toBe('client-w1');
  });

  it('findExerciseByClientID and findTemplateByClientID use client_id as the handle', () => {
    const db = new LocalDb(conn);
    mockConn().getFirstSync.mockReturnValue(null);
    expect(db.findExerciseByClientID('client-e1')).toBeNull();
    expect(db.findTemplateByClientID('client-t1')).toBeNull();
    expect(mockConn().getFirstSync).toHaveBeenCalledWith(
      'SELECT * FROM exercises WHERE client_id = ?',
      'client-e1',
    );
    expect(mockConn().getFirstSync).toHaveBeenCalledWith(
      'SELECT * FROM templates WHERE client_id = ?',
      'client-t1',
    );
  });
});
