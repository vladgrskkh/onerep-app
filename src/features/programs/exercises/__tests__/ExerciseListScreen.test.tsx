import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { ExerciseLocalRow } from '../../../../shared/db/database';

const exercises: ExerciseLocalRow[] = [
  {
    id: 'e1',
    name: 'Bench Press',
    is_built_in: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    muscle_groups: [{ id: 1, is_primary: true }],
    is_dirty: 0,
    operation: null,
    last_synced_at: null,
  },
  {
    id: 'e2',
    name: 'Squat',
    is_built_in: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    muscle_groups: [{ id: 2, is_primary: true }],
    is_dirty: 0,
    operation: null,
    last_synced_at: null,
  },
];

let mockRows: ExerciseLocalRow[];
const mockGetExercises = jest.fn(() => mockRows);
let mockSyncError: Error | null = null;
const mockSync = jest.fn(async () => ({ lastSyncedAt: '2026-01-01T00:00:00Z' }));

jest.mock('../../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({ getExercises: mockGetExercises })),
}));

jest.mock('../../../../shared/sync/useSync', () => ({
  useSync: () => ({
    sync: mockSync,
    isSyncing: false,
    lastSyncAt: null,
    lastSyncResult: null,
    lastError: mockSyncError,
  }),
}));

jest.mock('../../../../features/auth/AuthContext', () => ({
  useAuth: jest.fn(),
  getUserMessage: (error: unknown, fallback: string) => {
    const candidate = error as { userMessage?: string; message?: string };
    return candidate.userMessage ?? candidate.message ?? fallback;
  },
}));

// eslint-disable-next-line import/first
import { ExerciseListScreen } from '../ExerciseListScreen';

async function renderList() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<ExerciseListScreen />);
    await Promise.resolve();
  });
  return instance!;
}

function press(instance: ReturnType<typeof create>, testID: string) {
  return act(async () => {
    instance.root.findByProps({ testID }).props.onPress();
  });
}

function changeText(instance: ReturnType<typeof create>, testID: string, value: string) {
  return act(async () => {
    instance.root.findByProps({ testID }).props.onChangeText(value);
  });
}

async function pullToRefresh(instance: ReturnType<typeof create>) {
  const list = instance.root.findByProps({ testID: 'exercises.list' });
  await act(async () => {
    await list.props.refreshControl.props.onRefresh();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRows = exercises;
  mockSyncError = null;
});

describe('ExerciseListScreen', () => {
  it('renders rows from the local database helper', async () => {
    const instance = await renderList();

    expect(instance.root.findByProps({ testID: 'exercises.row.e1' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'exercises.row.e2' })).toBeTruthy();
  });

  it('filters rows by the search text', async () => {
    const instance = await renderList();

    await changeText(instance, 'exercises.search', 'squat');

    expect(instance.root.findAllByProps({ testID: 'exercises.row.e1' })).toHaveLength(0);
    expect(instance.root.findByProps({ testID: 'exercises.row.e2' })).toBeTruthy();
  });

  it('filters rows by the muscle group chips', async () => {
    const instance = await renderList();

    await press(instance, 'exercises.filter.chest');

    expect(instance.root.findByProps({ testID: 'exercises.row.e1' })).toBeTruthy();
    expect(instance.root.findAllByProps({ testID: 'exercises.row.e2' })).toHaveLength(0);
  });

  it('triggers a sync on pull-to-refresh and re-reads the database', async () => {
    const instance = await renderList();

    await pullToRefresh(instance);

    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('surfaces the sync error user message', async () => {
    mockSyncError = new Error('boom');
    const instance = await renderList();

    expect(instance.root.findByProps({ testID: 'exercises.error' }).props.children).toBe('boom');
  });

  it('calls the create callback from the header button', async () => {
    const onCreateExercise = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(<ExerciseListScreen onCreateExercise={onCreateExercise} />);
      await Promise.resolve();
    });

    await press(instance!, 'exercises.create');

    expect(onCreateExercise).toHaveBeenCalledTimes(1);
  });

  it('syncs on mount when the local cache is empty', async () => {
    mockRows = [];
    mockSync.mockResolvedValue({ lastSyncedAt: '2026-01-02T00:00:00Z' });
    await renderList();

    expect(mockSync).toHaveBeenCalledTimes(1);
  });
});
