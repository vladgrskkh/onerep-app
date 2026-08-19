import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ApiError } from '../../api/client';
import { gymApi } from '../../api/gym';
import type { LocalRow, SyncStore } from '../../db/database';
import { createGymSyncEngine, isConflictError } from '../SyncEngine';
import { FakeSyncStore, dirtyLocalRow, serverRow } from '../testing/fixtures';

jest.mock('../../api/gym', () => ({
  gymApi: {
    exercises: {
      list: jest.fn(async () => []),
      get: jest.fn(async () => ({ id: 'e1' })),
      create: jest.fn(async () => ({ id: 'e1' })),
      update: jest.fn(async () => ({ id: 'e1' })),
      delete: jest.fn(async () => undefined),
    },
    templates: {
      list: jest.fn(async () => []),
      get: jest.fn(async () => ({ id: 't1' })),
      create: jest.fn(async () => ({ id: 't1' })),
      update: jest.fn(async () => ({ id: 't1' })),
      delete: jest.fn(async () => undefined),
    },
    workouts: {
      start: jest.fn(async () => ({ id: 'w1' })),
      list: jest.fn(async () => []),
      get: jest.fn(async () => ({ id: 'w1' })),
      addExercise: jest.fn(async () => ({ id: 'we-server' })),
      logSet: jest.fn(async () => ({ id: 's-server' })),
      finish: jest.fn(async () => ({ id: 'w1', finished_at: '2026-01-01T10:00:00Z' })),
    },
    progress: {
      getBodyWeight: jest.fn(async () => []),
      logBodyWeight: jest.fn(async () => ({ id: 'bw1' })),
    },
  },
}));

type Mock = jest.Mock<(...args: any[]) => any>;
const api = gymApi as unknown as {
  exercises: Record<string, Mock>;
  templates: Record<string, Mock>;
  workouts: Record<string, Mock>;
  progress: Record<string, Mock>;
};

beforeEach(() => {
  for (const group of Object.values(api)) {
    for (const fn of Object.values(group)) {
      fn.mockClear();
    }
  }
  api.exercises.list.mockResolvedValue([]);
  api.templates.list.mockResolvedValue([]);
  api.workouts.list.mockResolvedValue([]);
  api.progress.getBodyWeight.mockResolvedValue([]);
});

describe('isConflictError', () => {
  it('treats 409 and 404 as conflicts', () => {
    expect(isConflictError(new ApiError(409, 'ACTIVE_WORKOUT', 'conflict'))).toBe(true);
    expect(isConflictError(new ApiError(404, 'EXERCISE_NOT_FOUND', 'gone'))).toBe(true);
  });

  it('does not treat other statuses or plain errors as conflicts', () => {
    expect(isConflictError(new ApiError(500, 'INTERNAL_ERROR', 'boom'))).toBe(false);
    expect(isConflictError(new ApiError(400, 'VALIDATION_ERROR', 'bad'))).toBe(false);
    expect(isConflictError(new Error('network'))).toBe(false);
  });
});

describe('gymApi adapters', () => {
  it('maps a dirty exercise row to the create request and marks it synced', async () => {
    const store = new FakeSyncStore();
    store.seed(
      'exercises',
      dirtyLocalRow({
        id: 'e1',
        operation: 'create',
        name: 'Squat',
        description: 'Barbell',
        notes: 'Deep',
        muscle_groups: [{ id: 1, is_primary: true }, { id: 2, is_primary: false }],
      }) as unknown as LocalRow,
    );
    api.exercises.create.mockResolvedValue(serverRow({ id: 'server-e1', version: 1 }));

    await createGymSyncEngine(store).sync();

    expect(api.exercises.create).toHaveBeenCalledWith({
      name: 'Squat',
      description: 'Barbell',
      notes: 'Deep',
      muscle_group_ids: [1, 2],
    });
    expect(store.calls.markSynced).toEqual([
      ['exercises', 'e1', expect.objectContaining({ id: 'server-e1' })],
    ]);
  });

  it('maps a dirty template row to update request with exercise items', async () => {
    const store = new FakeSyncStore();
    store.seed(
      'templates',
      dirtyLocalRow({
        id: 't1',
        operation: 'update',
        name: 'Push day',
        exercises: [
          { exercise_id: 'e1', sort_order: 0, planned_sets: 5 },
          { exercise_id: 'e2', sort_order: 1, planned_sets: 3 },
        ],
      }) as unknown as LocalRow,
    );
    api.templates.update.mockResolvedValue(serverRow({ id: 't1' }));

    await createGymSyncEngine(store).sync();

    expect(api.templates.update).toHaveBeenCalledWith('t1', {
      name: 'Push day',
      exercises: [
        { exercise_id: 'e1', planned_sets: 5 },
        { exercise_id: 'e2', planned_sets: 3 },
      ],
    });
  });

  it('soft-deletes dirty exercise rows and removes them locally', async () => {
    const store = new FakeSyncStore();
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'delete' }) as unknown as LocalRow);

    await createGymSyncEngine(store).sync();

    expect(api.exercises.delete).toHaveBeenCalledWith('e1');
    expect(store.calls.removeRow).toEqual([['exercises', 'e1']]);
  });

  it('pushes a local workout via start + addExercise + logSet replay', async () => {
    const store = new FakeSyncStore();
    api.workouts.start.mockResolvedValue(serverRow({ id: 'server-w1' }));
    api.workouts.addExercise.mockResolvedValue({ id: 'we-server' });
    api.workouts.get.mockResolvedValue(
      serverRow({
        id: 'server-w1',
        exercises: [{ id: 'we-server', exercise_id: 'e1', sort_order: 0 }],
      }),
    );
    store.seed(
      'workouts',
      dirtyLocalRow({
        id: 'w-local',
        operation: 'create',
        template_id: 't1',
        exercises: [
          {
            id: 'we-local',
            exercise_id: 'e1',
            sort_order: 0,
            sets: [{ id: 's-local', set_number: 1, weight_kg: 100, reps: 5, is_warmup: false }],
          },
        ],
      }) as unknown as LocalRow,
    );

    await createGymSyncEngine(store).sync();

    expect(api.workouts.start).toHaveBeenCalledWith({ template_id: 't1' });
    expect(api.workouts.addExercise).toHaveBeenCalledWith('server-w1', { exercise_id: 'e1' });
    expect(api.workouts.logSet).toHaveBeenCalledWith('server-w1', 'we-server', {
      weight_kg: 100,
      reps: 5,
      rpe: undefined,
      rest_seconds: undefined,
      is_warmup: false,
    });
    expect(store.calls.markSynced).toEqual([
      ['workouts', 'w-local', expect.objectContaining({ id: 'server-w1' })],
    ]);
  });

  it('replays a locally finished workout create as finished', async () => {
    const store = new FakeSyncStore();
    api.workouts.start.mockResolvedValue(serverRow({ id: 'server-w1' }));
    api.workouts.addExercise.mockResolvedValue({ id: 'we-server' });
    api.workouts.finish.mockResolvedValue(
      serverRow({ id: 'server-w1', finished_at: '2026-01-01T10:00:00Z' }),
    );
    store.seed(
      'workouts',
      dirtyLocalRow({
        id: 'w-local',
        operation: 'create',
        template_id: 't1',
        finished_at: '2026-01-01T10:00:00Z',
      }) as unknown as LocalRow,
    );

    await createGymSyncEngine(store).sync();

    expect(api.workouts.finish).toHaveBeenCalledWith('server-w1');
    expect(store.calls.markSynced).toEqual([
      [
        'workouts',
        'w-local',
        expect.objectContaining({ id: 'server-w1', finished_at: '2026-01-01T10:00:00Z' }),
      ],
    ]);
  });

  it('offers no update/delete push for workouts and body weights', async () => {
    const store = new FakeSyncStore();
    store.seed('workouts', dirtyLocalRow({ id: 'w1', operation: 'delete' }) as unknown as LocalRow);
    store.seed(
      'body_weights',
      dirtyLocalRow({ id: 'bw1', operation: 'update', weight_kg: 80 }) as unknown as LocalRow,
    );

    const result = await createGymSyncEngine(store).sync();

    expect(result.unsupported).toBe(2);
    expect(api.workouts.start).not.toHaveBeenCalled();
    expect(api.progress.logBodyWeight).not.toHaveBeenCalled();
  });

  it('pushes a local body weight entry via logBodyWeight', async () => {
    const store = new FakeSyncStore();
    store.seed(
      'body_weights',
      dirtyLocalRow({
        id: 'bw-local',
        operation: 'create',
        weight_kg: 82.5,
        measured_at: '2026-01-01T08:00:00Z',
      }) as unknown as LocalRow,
    );
    api.progress.logBodyWeight.mockResolvedValue(
      serverRow({ id: 'server-bw1', weight_kg: 82.5, measured_at: '2026-01-01T08:00:00Z' }),
    );

    await createGymSyncEngine(store).sync();

    expect(api.progress.logBodyWeight).toHaveBeenCalledWith({
      weight_kg: 82.5,
      measured_at: '2026-01-01T08:00:00Z',
    });
    expect(store.calls.markSynced).toEqual([
      ['body_weights', 'bw-local', expect.objectContaining({ id: 'server-bw1' })],
    ]);
  });

  it('pulls every table with the since parameter and fetches one row on conflict', async () => {
    const store = new FakeSyncStore();
    store.lastSyncedAt = '2026-01-02T00:00:00Z';
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'update' }) as unknown as LocalRow);
    api.exercises.update.mockRejectedValue(new ApiError(409, 'CONFLICT', 'conflict'));
    api.exercises.get.mockResolvedValue(serverRow({ id: 'e1', version: 7 }));

    await createGymSyncEngine(store).sync();

    expect(api.exercises.list).toHaveBeenCalledWith({ since: '2026-01-02T00:00:00Z' });
    expect(api.templates.list).toHaveBeenCalledWith({ since: '2026-01-02T00:00:00Z' });
    expect(api.workouts.list).toHaveBeenCalledWith({ since: '2026-01-02T00:00:00Z' });
    expect(api.progress.getBodyWeight).toHaveBeenCalledWith({ since: '2026-01-02T00:00:00Z' });
    expect(api.exercises.get).toHaveBeenCalledWith('e1');
    expect(store.calls.upsertRemote).toEqual([
      ['exercises', expect.objectContaining({ id: 'e1', version: 7 })],
    ]);
  });
});

describe('SyncStore adapter wiring', () => {
  it('pulls all four tables on the first sync', async () => {
    const store: SyncStore = new FakeSyncStore();
    const result = await createGymSyncEngine(store).sync();

    expect(api.exercises.list).toHaveBeenCalledWith(undefined);
    expect(api.templates.list).toHaveBeenCalledWith(undefined);
    expect(api.workouts.list).toHaveBeenCalledWith(undefined);
    expect(api.progress.getBodyWeight).toHaveBeenCalledWith(undefined);
    expect(result.pulled).toBe(0);
  });
});
