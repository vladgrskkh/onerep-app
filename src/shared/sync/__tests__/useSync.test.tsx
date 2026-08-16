import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';
import { Button, Text, View } from 'react-native';

import type { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';

import { gymApi } from '../../api/gym';
import { useSync } from '../useSync';
import { FakeSyncStore } from '../testing/fixtures';

const mockListExercises = (
  gymApi as unknown as {
    exercises: { list: jest.Mock<() => Promise<unknown[]>> };
  }
).exercises.list;

let mockNetInfoListener: ((state: NetInfoState) => void) | null = null;

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((listener: (state: NetInfoState) => void) => {
    mockNetInfoListener = listener;
    return jest.fn();
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

function Harness() {
  const result = useSync();
  return (
    <View>
      <Text testID="syncing">{result.isSyncing ? 'yes' : 'no'}</Text>
      <Text testID="lastSyncAt">{result.lastSyncAt ?? 'none'}</Text>
      <Text testID="lastError">{result.lastError?.message ?? 'none'}</Text>
      <Button testID="manual" title="sync" onPress={() => void result.sync()} />
    </View>
  );
}

async function renderAndSettle(): Promise<ReturnType<typeof create>> {
  const tree = create(<Harness />);
  await act(async () => {
    await Promise.resolve();
  });
  return tree;
}

function emitConnectivity(isConnected: boolean): Promise<void> {
  return act(async () => {
    mockNetInfoListener?.({
      type: 'wifi' as NetInfoStateType,
      isConnected,
      isInternetReachable: isConnected,
    } as NetInfoState);
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockNetInfoListener = null;
  mockCurrentUser = null;
  mockStore = new FakeSyncStore();
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
    expect(tree.root.findByProps({ testID: 'syncing' }).props.children).toBe('no');
    expect(tree.root.findByProps({ testID: 'lastSyncAt' }).props.children).not.toBe('none');
  });

  it('does not sync when there is no authenticated user', async () => {
    mockCurrentUser = null;
    await renderAndSettle();

    await emitConnectivity(true);
    await act(async () => {});

    expect(mockListExercises).not.toHaveBeenCalled();
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
      await tree.root.findByProps({ testID: 'manual' }).props.onPress();
    });

    expect(mockListExercises).toHaveBeenCalledTimes(1);
  });

  it('manual sync is a no-op when unauthenticated', async () => {
    const tree = await renderAndSettle();

    await act(async () => {
      await tree.root.findByProps({ testID: 'manual' }).props.onPress();
    });

    expect(mockListExercises).not.toHaveBeenCalled();
  });

  it('records the last error when the engine fails', async () => {
    mockCurrentUser = { id: 'u1' };
    mockListExercises.mockRejectedValue(new Error('boom'));
    const tree = await renderAndSettle();

    await act(async () => {
      await tree.root.findByProps({ testID: 'manual' }).props.onPress();
    });

    expect(tree.root.findByProps({ testID: 'lastError' }).props.children).toBe('boom');
    expect(tree.root.findByProps({ testID: 'syncing' }).props.children).toBe('no');
  });

  it('initialises lastSyncAt from the local store', async () => {
    mockCurrentUser = { id: 'u1' };
    mockStore.lastSyncedAt = '2026-01-02T00:00:00Z';
    const tree = await renderAndSettle();

    await act(async () => {});

    expect(tree.root.findByProps({ testID: 'lastSyncAt' }).props.children).toBe('2026-01-02T00:00:00Z');
  });
});
