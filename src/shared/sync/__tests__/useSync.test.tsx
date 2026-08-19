import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';
import { Button, Text, View } from 'react-native';

import type { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';

import { gymApi } from '../../api/gym';
import { getLocalDb } from '../../db/database';
import * as syncEngine from '../SyncEngine';
import { SyncProvider } from '../SyncContext';
import { useSync } from '../useSync';
import { FakeSyncStore } from '../testing/fixtures';

const mockListExercises = (
  gymApi as unknown as {
    exercises: { list: jest.Mock<() => Promise<unknown[]>> };
  }
).exercises.list;
const mockCreateGymSyncEngine = jest.spyOn(syncEngine, 'createGymSyncEngine');

let mockNetInfoListeners: ((state: NetInfoState) => void)[] = [];
let mockNetInfoUnsubscribes: jest.Mock[] = [];

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((listener: (state: NetInfoState) => void) => {
    mockNetInfoListeners.push(listener);
    const unsubscribe = jest.fn();
    mockNetInfoUnsubscribes.push(unsubscribe);
    return unsubscribe;
  }),
}));

let mockCurrentUser: { id: string } | null = null;

jest.mock('../../../features/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockCurrentUser }),
}));

let mockStore: FakeSyncStore;

jest.mock('../../db/database', () => ({
  getLocalDb: jest.fn(() => mockStore),
}));

jest.mock('../../api/gym', () => ({
  gymApi: {
    exercises: {
      list: jest.fn(async () => []),
      get: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'e1' })),
      update: jest.fn(async () => ({ id: 'e1' })),
      delete: jest.fn(async () => undefined),
    },
    templates: {
      list: jest.fn(async () => []),
      get: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 't1' })),
      update: jest.fn(async () => ({ id: 't1' })),
      delete: jest.fn(async () => undefined),
    },
    workouts: {
      start: jest.fn(async () => ({ id: 'w1' })),
      list: jest.fn(async () => []),
      get: jest.fn(async () => ({ id: 'w1' })),
      addExercise: jest.fn(async () => ({ id: 'we1' })),
      logSet: jest.fn(async () => ({ id: 's1' })),
    },
    progress: {
      getBodyWeight: jest.fn(async () => []),
      logBodyWeight: jest.fn(async () => ({ id: 'bw1' })),
    },
  },
}));

function Harness({ id = 'single' }: { id?: string }) {
  const result = useSync();
  return (
    <View>
      <Text testID={`${id}.syncing`}>{result.isSyncing ? 'yes' : 'no'}</Text>
      <Text testID={`${id}.lastSyncAt`}>{result.lastSyncAt ?? 'none'}</Text>
      <Text testID={`${id}.lastSyncResult`}>{result.lastSyncResult ? 'set' : 'none'}</Text>
      <Text testID={`${id}.lastError`}>{result.lastError?.message ?? 'none'}</Text>
      <Button testID={`${id}.manual`} title="sync" onPress={() => void result.sync()} />
    </View>
  );
}

async function renderAndSettle(): Promise<ReturnType<typeof create>> {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <SyncProvider>
        <Harness />
      </SyncProvider>,
    );
    await Promise.resolve();
  });
  return tree;
}

function emitConnectivity(isConnected: boolean): Promise<void> {
  return act(async () => {
    for (const listener of mockNetInfoListeners) {
      listener({
        type: 'wifi' as NetInfoStateType,
        isConnected,
        isInternetReachable: isConnected,
      } as NetInfoState);
    }
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockNetInfoListeners = [];
  mockNetInfoUnsubscribes = [];
  mockCurrentUser = null;
  mockStore = new FakeSyncStore();
  (getLocalDb as jest.Mock).mockClear();
  mockCreateGymSyncEngine.mockClear();
  mockListExercises.mockClear();
  mockListExercises.mockResolvedValue([]);
});

describe('useSync', () => {
  it('syncs when connectivity is reported while authenticated', async () => {
    mockCurrentUser = { id: 'u1' };
    const tree = await renderAndSettle();

    await emitConnectivity(true);
    await act(async () => {});

    expect(mockListExercises).toHaveBeenCalledTimes(1);
    expect(tree.root.findByProps({ testID: 'single.syncing' }).props.children).toBe('no');
    expect(tree.root.findByProps({ testID: 'single.lastSyncAt' }).props.children).not.toBe('none');
  });

  it('does not sync when there is no authenticated user', async () => {
    mockCurrentUser = null;
    await renderAndSettle();

    await emitConnectivity(true);
    await act(async () => {});

    expect(mockListExercises).not.toHaveBeenCalled();
    expect(mockNetInfoListeners).toHaveLength(1);
  });

  it('does not sync while offline', async () => {
    mockCurrentUser = { id: 'u1' };
    await renderAndSettle();

    await emitConnectivity(false);

    expect(mockListExercises).not.toHaveBeenCalled();
  });

  it('exposes a manual sync for pull-to-refresh', async () => {
    mockCurrentUser = { id: 'u1' };
    const tree = await renderAndSettle();

    await act(async () => {
      await tree.root.findByProps({ testID: 'single.manual' }).props.onPress();
    });

    expect(mockListExercises).toHaveBeenCalledTimes(1);
  });

  it('manual sync is a no-op when unauthenticated', async () => {
    const tree = await renderAndSettle();

    await act(async () => {
      await tree.root.findByProps({ testID: 'single.manual' }).props.onPress();
    });

    expect(mockListExercises).not.toHaveBeenCalled();
  });

  it('records the last error when the engine fails', async () => {
    mockCurrentUser = { id: 'u1' };
    mockListExercises.mockRejectedValue(new Error('boom'));
    const tree = await renderAndSettle();

    await act(async () => {
      await tree.root.findByProps({ testID: 'single.manual' }).props.onPress();
    });

    expect(tree.root.findByProps({ testID: 'single.lastError' }).props.children).toBe('boom');
    expect(tree.root.findByProps({ testID: 'single.syncing' }).props.children).toBe('no');
  });

  it('initialises lastSyncAt from the local store', async () => {
    mockCurrentUser = { id: 'u1' };
    mockStore.lastSyncedAt = '2026-01-02T00:00:00Z';
    const tree = await renderAndSettle();

    await act(async () => {});

    expect(tree.root.findByProps({ testID: 'single.lastSyncAt' }).props.children).toBe('2026-01-02T00:00:00Z');
  });

  it('resets shared sync metadata when the authenticated account changes', async () => {
    mockCurrentUser = { id: 'u1' };
    const tree = await renderAndSettle();

    await act(async () => {
      await tree.root.findByProps({ testID: 'single.manual' }).props.onPress();
    });
    expect(tree.root.findByProps({ testID: 'single.lastSyncAt' }).props.children).not.toBe('none');
    expect(tree.root.findByProps({ testID: 'single.lastSyncResult' }).props.children).toBe('set');

    mockListExercises.mockRejectedValueOnce(new Error('old account error'));
    await act(async () => {
      await tree.root.findByProps({ testID: 'single.manual' }).props.onPress();
    });
    expect(tree.root.findByProps({ testID: 'single.lastError' }).props.children).toBe('old account error');

    mockCurrentUser = { id: 'u2' };
    await act(async () => {
      tree.update(
        <SyncProvider>
          <Harness />
        </SyncProvider>,
      );
      await Promise.resolve();
    });

    expect(tree.root.findByProps({ testID: 'single.lastSyncAt' }).props.children).toBe('none');
    expect(tree.root.findByProps({ testID: 'single.lastSyncResult' }).props.children).toBe('none');
    expect(tree.root.findByProps({ testID: 'single.lastError' }).props.children).toBe('none');
    expect(mockCreateGymSyncEngine).toHaveBeenCalledTimes(1);
    expect(mockNetInfoListeners).toHaveLength(1);
  });

  it('ignores an in-flight sync result after logout', async () => {
    mockCurrentUser = { id: 'u1' };
    let releaseSync!: (value: unknown[]) => void;
    mockListExercises.mockReturnValueOnce(new Promise<unknown[]>((resolve) => {
      releaseSync = resolve;
    }));
    const tree = await renderAndSettle();

    await act(async () => {
      void tree.root.findByProps({ testID: 'single.manual' }).props.onPress();
      await Promise.resolve();
    });

    mockCurrentUser = null;
    await act(async () => {
      tree.update(
        <SyncProvider>
          <Harness />
        </SyncProvider>,
      );
      await Promise.resolve();
    });

    releaseSync([]);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(tree.root.findByProps({ testID: 'single.lastSyncAt' }).props.children).toBe('none');
    expect(tree.root.findByProps({ testID: 'single.lastSyncResult' }).props.children).toBe('none');
    expect(tree.root.findByProps({ testID: 'single.lastError' }).props.children).toBe('none');
  });

  it('shares one engine, listener, and sync state between consumers', async () => {
    mockCurrentUser = { id: 'u1' };
    let tree!: ReturnType<typeof create>;

    await act(async () => {
      tree = create(
        <SyncProvider>
          <Harness id="first" />
          <Harness id="second" />
        </SyncProvider>,
      );
      await Promise.resolve();
    });
    await emitConnectivity(true);
    await act(async () => {});

    expect(getLocalDb).toHaveBeenCalledTimes(1);
    expect(mockCreateGymSyncEngine).toHaveBeenCalledTimes(1);
    expect(mockNetInfoListeners).toHaveLength(1);
    expect(mockListExercises).toHaveBeenCalledTimes(1);
    expect(tree.root.findByProps({ testID: 'first.lastSyncAt' }).props.children).not.toBe('none');
    expect(tree.root.findByProps({ testID: 'second.lastSyncAt' }).props.children).not.toBe('none');
  });

  it('cleans up the shared listener once when the provider unmounts', async () => {
    mockCurrentUser = { id: 'u1' };
    const tree = await renderAndSettle();

    await act(async () => {
      tree.unmount();
    });

    expect(mockNetInfoUnsubscribes).toHaveLength(1);
    expect(mockNetInfoUnsubscribes[0]).toHaveBeenCalledTimes(1);
  });
});
