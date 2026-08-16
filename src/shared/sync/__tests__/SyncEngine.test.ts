import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ApiError } from '../../api/client';
import type { ServerRow, LocalRow } from '../../db/database';
import { SyncEngine, type SyncTableAdapter } from '../SyncEngine';
import { FakeSyncStore, dirtyLocalRow, serverRow } from '../testing/fixtures';

function conflictError(status = 409): ApiError {
  return new ApiError(status, 'CONFLICT', 'conflict');
}

function makeAdapter(
  table: SyncTableAdapter['table'],
  overrides: Partial<SyncTableAdapter> = {},
): SyncTableAdapter {
  return {
    table,
    pull: jest.fn(async () => [] as ServerRow[]),
    fetchOne: jest.fn(async () => null),
    pushCreate: jest.fn(async (row: LocalRow) => serverRow({ id: `server-${row.id}` })),
    pushUpdate: jest.fn(async (row: LocalRow) => serverRow({ id: row.id })),
    pushDelete: jest.fn(async () => undefined),
    isConflict: (error: unknown) => error instanceof ApiError && error.status === 409,
    ...overrides,
  };
}

let clockCalls: number;

function makeEngine(
  store: FakeSyncStore,
  adapters: SyncTableAdapter[],
  opts: { clock?: () => string } = {},
): SyncEngine {
  clockCalls = 0;
  const clock = () => {
    clockCalls += 1;
    return `2026-01-03T0${clockCalls}:00:00.000Z`;
  };
  return new SyncEngine({ store, adapters, clock: opts.clock ?? clock });
}

describe('SyncEngine.pushLocal', () => {
  let store: FakeSyncStore;
  let adapter: SyncTableAdapter;

  beforeEach(() => {
    store = new FakeSyncStore();
    adapter = makeAdapter('exercises');
  });

  it('pushes a create row and marks it synced with the server row', async () => {
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'create' }));
    const engine = makeEngine(store, [adapter]);

    const result = await engine.pushLocal();

    expect(adapter.pushCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e1', operation: 'create' }),
    );
    expect(store.calls.markSynced).toEqual([['exercises', 'e1', expect.objectContaining({ id: 'server-e1' })]]);
    expect(result.pushed).toBe(1);
    expect(result.conflicts).toBe(0);
  });

  it('pushes an update row', async () => {
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'update' }));
    const engine = makeEngine(store, [adapter]);

    const result = await engine.pushLocal();

    expect(adapter.pushUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
    expect(adapter.pushCreate).not.toHaveBeenCalled();
    expect(result.pushed).toBe(1);
  });

  it('pushes a delete row and removes the local row on success', async () => {
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'delete' }));
    const engine = makeEngine(store, [adapter]);

    const result = await engine.pushLocal();

    expect(adapter.pushDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
    expect(store.calls.removeRow).toEqual([['exercises', 'e1']]);
    expect(result.pushed).toBe(1);
  });

  it('orders deletes before updates before creates', async () => {
    const ops: string[] = [];
    const loggingAdapter = makeAdapter('exercises', {
      pushCreate: jest.fn(async (row: LocalRow) => {
        ops.push(`create:${row.id}`);
        return serverRow({ id: row.id });
      }),
      pushUpdate: jest.fn(async (row: LocalRow) => {
        ops.push(`update:${row.id}`);
        return serverRow({ id: row.id });
      }),
      pushDelete: jest.fn(async (row: LocalRow) => {
        ops.push(`delete:${row.id}`);
      }),
    });
    store.seed('exercises', dirtyLocalRow({ id: 'c1', operation: 'create', created_at: '2026-01-01T01:00:00Z' }));
    store.seed('exercises', dirtyLocalRow({ id: 'u1', operation: 'update', created_at: '2026-01-01T02:00:00Z' }));
    store.seed('exercises', dirtyLocalRow({ id: 'd1', operation: 'delete', created_at: '2026-01-01T03:00:00Z' }));
    const engine = makeEngine(store, [loggingAdapter]);

    await engine.pushLocal();

    expect(ops).toEqual(['delete:d1', 'update:u1', 'create:c1']);
  });

  it('drops the local change and pulls the server row on conflict', async () => {
    const conflictAdapter = makeAdapter('exercises', {
      pushUpdate: jest.fn(async () => {
        throw conflictError();
      }),
      fetchOne: jest.fn(async () => serverRow({ id: 'e1', updated_at: '2026-01-05T00:00:00Z' })),
    });
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'update' }));
    const engine = makeEngine(store, [conflictAdapter]);

    const result = await engine.pushLocal();

    expect(result.conflicts).toBe(1);
    expect(result.pushed).toBe(0);
    expect(result.droppedChangeIds).toEqual(['exercises:e1']);
    expect(store.calls.upsertRemote).toEqual([
      ['exercises', expect.objectContaining({ id: 'e1', updated_at: '2026-01-05T00:00:00Z' })],
    ]);
    expect(store.calls.markSynced).toHaveLength(0);
    expect(store.calls.removeRow).toEqual([['exercises', 'e1']]);
    expect(store.isDirtyRow('exercises', 'e1')).toBe(false);
  });

  it('removes the local row when the server row is gone (404) after a conflict', async () => {
    const conflictAdapter = makeAdapter('exercises', {
      pushUpdate: jest.fn(async () => {
        throw conflictError();
      }),
      fetchOne: jest.fn(async () => null),
    });
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'update' }));
    const engine = makeEngine(store, [conflictAdapter]);

    const result = await engine.pushLocal();

    expect(result.conflicts).toBe(1);
    expect(store.calls.removeRow).toEqual([['exercises', 'e1']]);
  });

  it('keeps the row dirty on non-conflict errors and continues with other rows', async () => {
    const flakyAdapter = makeAdapter('exercises', {
      pushUpdate: jest.fn(async () => {
        throw new Error('network down');
      }),
    });
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'update' }));
    store.seed('exercises', dirtyLocalRow({ id: 'e2', operation: 'create' }));
    const engine = makeEngine(store, [flakyAdapter]);

    const result = await engine.pushLocal();

    expect(result.errors).toEqual([
      expect.objectContaining({ table: 'exercises', id: 'e1', operation: 'update', message: 'network down' }),
    ]);
    expect(store.isDirtyRow('exercises', 'e1')).toBe(true);
    expect(store.calls.markSynced).toHaveLength(1);
    expect(result.pushed).toBe(1);
  });

  it('skips rows whose operation has no API support and keeps them dirty', async () => {
    const createOnly = makeAdapter('exercises', { pushUpdate: undefined, pushDelete: undefined });
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'update' }));
    const engine = makeEngine(store, [createOnly]);

    const result = await engine.pushLocal();

    expect(result.unsupported).toBe(1);
    expect(result.skippedIds).toEqual(['exercises:e1']);
    expect(store.isDirtyRow('exercises', 'e1')).toBe(true);
  });
});

describe('SyncEngine.pullRemote', () => {
  let store: FakeSyncStore;

  beforeEach(() => {
    store = new FakeSyncStore();
    store.lastSyncedAt = '2026-01-02T00:00:00Z';
  });

  it('pulls rows with since=lastSyncedAt and upserts them', async () => {
    const adapter = makeAdapter('exercises', {
      pull: jest.fn(async () => [serverRow({ id: 'e1' }), serverRow({ id: 'e2' })]),
    });
    const engine = makeEngine(store, [adapter]);

    const result = await engine.pullRemote();

    expect(adapter.pull).toHaveBeenCalledWith('2026-01-02T00:00:00Z');
    expect(store.calls.upsertRemote).toEqual([
      ['exercises', expect.objectContaining({ id: 'e1' })],
      ['exercises', expect.objectContaining({ id: 'e2' })],
    ]);
    expect(result.pulled).toBe(2);
  });

  it('never overwrites local dirty rows with remote data', async () => {
    const adapter = makeAdapter('exercises', {
      pull: jest.fn(async () => [serverRow({ id: 'e1' })]),
    });
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'update', is_dirty: 1 }));
    const engine = makeEngine(store, [adapter]);

    const result = await engine.pullRemote();

    expect(store.calls.upsertRemote).toHaveLength(0);
    expect(store.isDirtyRow('exercises', 'e1')).toBe(true);
    expect(result.pulled).toBe(0);
  });

  it('advances sync_state to the clock captured before fetching', async () => {
    const clock = jest
      .fn<() => string>()
      .mockReturnValue('2026-01-10T00:00:00.000Z');
    const adapter = makeAdapter('exercises', {
      pull: jest.fn(async () => [serverRow({ id: 'e1' })]),
    });
    const engine = makeEngine(store, [adapter], { clock });

    await engine.pullRemote();

    expect(store.getLastSyncedAt()).toBe('2026-01-10T00:00:00.000Z');
  });

  it('uses no since filter on the very first sync', async () => {
    store.lastSyncedAt = null;
    const adapter = makeAdapter('exercises');
    const engine = makeEngine(store, [adapter]);

    await engine.pullRemote();

    expect(adapter.pull).toHaveBeenCalledWith(undefined);
  });
});

describe('SyncEngine.sync', () => {
  it('pushes before pulling and reports the new lastSyncedAt', async () => {
    const store = new FakeSyncStore();
    const ops: string[] = [];
    const adapter = makeAdapter('exercises', {
      pushCreate: jest.fn(async (row: LocalRow) => {
        ops.push('push');
        return serverRow({ id: row.id });
      }),
      pull: jest.fn(async () => {
        ops.push('pull');
        return [serverRow({ id: 'e9' })];
      }),
    });
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'create' }));
    const engine = makeEngine(store, [adapter]);

    const result = await engine.sync();

    expect(ops).toEqual(['push', 'pull']);
    expect(result.pushed).toBe(1);
    expect(result.pulled).toBe(1);
    expect(result.lastSyncedAt).not.toBeNull();
    expect(result.startedAt < result.finishedAt).toBe(true);
  });

  it('is re-entrant: concurrent sync calls share the same in-flight promise', async () => {
    const store = new FakeSyncStore();
    const adapter = makeAdapter('exercises', {
      pull: jest.fn(async () => [serverRow({ id: 'e1' })]),
    });
    const engine = makeEngine(store, [adapter]);

    const [first, second] = await Promise.all([engine.sync(), engine.sync()]);

    expect(first).toBe(second);
    expect(adapter.pull).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh sync after the previous one completed', async () => {
    const store = new FakeSyncStore();
    const adapter = makeAdapter('exercises', {
      pull: jest.fn(async () => [serverRow({ id: 'e1' })]),
    });
    const engine = makeEngine(store, [adapter]);

    await engine.sync();
    await engine.sync();

    expect(adapter.pull).toHaveBeenCalledTimes(2);
  });

  it('advances the since timestamp between syncs', async () => {
    const store = new FakeSyncStore();
    const adapter = makeAdapter('exercises');
    const engine = makeEngine(store, [adapter]);

    await engine.sync();
    const firstSyncAt = store.getLastSyncedAt();
    await engine.sync();

    expect(adapter.pull).toHaveBeenNthCalledWith(1, undefined);
    expect(adapter.pull).toHaveBeenNthCalledWith(2, firstSyncAt);
  });

  it('pulls with since=undefined when the store has no sync state yet', async () => {
    const store = new FakeSyncStore();
    const adapter = makeAdapter('exercises');
    const engine = makeEngine(store, [adapter]);

    await engine.sync();

    expect(adapter.pull).toHaveBeenCalledWith(undefined);
  });

  it('still pulls after a push conflict', async () => {
    const store = new FakeSyncStore();
    const adapter = makeAdapter('exercises', {
      pushCreate: jest.fn(async () => {
        throw conflictError();
      }),
      pull: jest.fn(async () => [serverRow({ id: 'e1' })]),
    });
    store.seed('exercises', dirtyLocalRow({ id: 'e1', operation: 'create' }));
    const engine = makeEngine(store, [adapter]);

    const result = await engine.sync();

    expect(result.conflicts).toBe(1);
    expect(result.pulled).toBe(1);
  });
});
