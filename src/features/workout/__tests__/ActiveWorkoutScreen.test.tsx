import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { WorkoutLocalRow } from '../../../shared/db/database';

// The workout after its create op was pushed: the row was re-keyed to the
// server id with server-assigned timestamps, and the client_id (the id the
// screen was navigated with) was carried through.
const syncedWorkout: WorkoutLocalRow = {
  id: 'server-w1',
  client_id: 'w1',
  user_id: 'u1',
  template_id: 't1',
  started_at: '2026-02-03T09:00:00Z',
  created_at: '2026-02-03T09:00:00Z',
  updated_at: '2026-02-03T09:00:00Z',
  is_dirty: 0,
  operation: null,
  last_synced_at: '2026-02-03T09:00:00Z',
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

let mockRow: WorkoutLocalRow | null;
let mockLastSyncAt: string | null = null;
let mockDataGeneration = 0;
// After the push, the old client-id row is gone from the id index; the row
// is only reachable via its carried client_id.
const mockGetWorkout = jest.fn(() => null);
const mockFindWorkoutByClientID = jest.fn(() => mockRow);
const mockGetExercises = jest.fn(() => [
  { id: 'e1', name: 'Bench Press' },
  { id: 'e2', name: 'Squat' },
]);
const mockGetTemplate = jest.fn(() => ({ id: 't1', name: 'Push day' }));
const mockUpsertWorkout = jest.fn<(row: unknown, sync?: object) => void>();
const mockUpsertRemote = jest.fn<(table: string, row: unknown) => void>();
const mockGetDataGeneration = jest.fn(() => mockDataGeneration);
const mockSync = jest.fn(async () => ({ lastSyncedAt: '2026-01-02T00:00:00Z' }));

jest.mock('../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    getWorkout: mockGetWorkout,
    findWorkoutByClientID: mockFindWorkoutByClientID,
    getExercises: mockGetExercises,
    getTemplate: mockGetTemplate,
    upsertWorkout: mockUpsertWorkout,
    upsertRemote: mockUpsertRemote,
    getDataGeneration: mockGetDataGeneration,
  })),
}));

jest.mock('../../../shared/sync/useSync', () => ({
  useSync: () => ({
    sync: mockSync,
    isSyncing: false,
    lastSyncAt: mockLastSyncAt,
    lastError: null,
  }),
}));

jest.mock('../../../shared/api/gym', () => ({
  gymApi: {
    workouts: {
      logSet: jest.fn(async () => ({
        id: 's2',
        set_number: 2,
        weight_kg: 110,
        reps: 5,
        is_warmup: false,
        is_pr: true,
        estimated_1rm: 128,
      })),
      addExercise: jest.fn(async () => ({
        id: 'we2',
        exercise_id: 'e2',
        sort_order: 1,
      })),
      finish: jest.fn(async () => ({})),
    },
  },
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// eslint-disable-next-line import/first
import { gymApi } from '../../../shared/api/gym';

const mockLogSet = gymApi.workouts.logSet as jest.Mock<(...args: any[]) => any>;
const mockAddExercise = gymApi.workouts.addExercise as jest.Mock<(...args: any[]) => any>;
const mockFinish = gymApi.workouts.finish as jest.Mock<(...args: any[]) => any>;

// eslint-disable-next-line import/first
import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';

let currentInstance: ReturnType<typeof create> | null = null;

async function renderActive() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<ActiveWorkoutScreen workoutId="w1" />);
  });
  currentInstance = instance!;
  return instance!;
}

function changeText(instance: ReturnType<typeof create>, testID: string, value: string) {
  return act(async () => {
    instance.root.findByProps({ testID }).props.onChangeText(value);
  });
}

async function logSet(instance: ReturnType<typeof create>, weight = '110', reps = '5') {
  await act(async () => {
    instance.root.findByProps({ testID: 'workout.logSet.we1' }).props.onPress();
  });
  await changeText(instance, 'workout.logWeight', weight);
  await changeText(instance, 'workout.logReps', reps);
  await act(async () => {
    await instance.root.findByProps({ testID: 'workout.submitSet' }).props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRow = syncedWorkout;
  mockLastSyncAt = null;
  mockDataGeneration = 0;
  mockUpsertWorkout.mockReturnValue(undefined);
  mockUpsertRemote.mockReturnValue(undefined);
  mockLogSet.mockResolvedValue({
    id: 's2',
    set_number: 2,
    weight_kg: 110,
    reps: 5,
    is_warmup: false,
    is_pr: true,
    estimated_1rm: 128,
  });
  mockAddExercise.mockResolvedValue({
    id: 'we2',
    exercise_id: 'e2',
    sort_order: 1,
  });
  mockFinish.mockResolvedValue({ ...syncedWorkout, finished_at: '2026-01-01T09:00:00Z' });
});

afterEach(() => {
  if (currentInstance) {
    act(() => {
      currentInstance!.unmount();
    });
    currentInstance = null;
  }
});

describe('ActiveWorkoutScreen', () => {
  it('renders the workout header, exercise cards with set chips and the next-set hint', async () => {
    const instance = await renderActive();

    expect(instance.root.findByProps({ children: 'Push day' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'workout.exercise.we1' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'workout.exercise.we1.set.s1' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'workout.nextSet.we1' })).toBeTruthy();
  });

  it('posts a set to the API for a synced workout and shows the PR badge', async () => {
    const instance = await renderActive();

    await logSet(instance);

    expect(mockLogSet).toHaveBeenCalledWith('server-w1', 'we1', {
      weight_kg: 110,
      reps: 5,
      is_warmup: false,
    });
    expect(instance.root.findByProps({ testID: 'workout.prBadge' })).toBeTruthy();
    expect(mockUpsertWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'server-w1',
        exercises: expect.arrayContaining([
          expect.objectContaining({
            id: 'we1',
            sets: expect.arrayContaining([expect.objectContaining({ id: 's2', is_pr: true })]),
          }),
        ]),
      }),
      { is_dirty: 0, operation: undefined, client_id: 'w1' },
    );
  });

  it('starts the rest timer pill from the last logged set rest_seconds', async () => {
    const instance = await renderActive();

    await act(async () => {
      instance.root.findByProps({ testID: 'workout.logSet.we1' }).props.onPress();
    });
    await changeText(instance, 'workout.logWeight', '110');
    await changeText(instance, 'workout.logReps', '5');
    await changeText(instance, 'workout.logRest', '90');
    await act(async () => {
      await instance.root.findByProps({ testID: 'workout.submitSet' }).props.onPress();
    });

    expect(instance.root.findByProps({ testID: 'workout.restTimer' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'workout.restTimerLabel' })).toBeTruthy();
    expect(mockLogSet).toHaveBeenCalledWith(
      'server-w1',
      'we1',
      expect.objectContaining({ rest_seconds: 90 }),
    );
  });

  it('keeps a pending-create workout local without calling the logSet API', async () => {
    // Pre-push state: the row id IS the client_id and the create op is pending.
    mockRow = { ...syncedWorkout, id: 'w1', is_dirty: 1, operation: 'create' };
    const instance = await renderActive();

    await logSet(instance);

    expect(mockLogSet).not.toHaveBeenCalled();
    expect(mockUpsertWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w1',
        exercises: expect.arrayContaining([
          expect.objectContaining({ sets: expect.arrayContaining([expect.anything()]) }),
        ]),
      }),
      { is_dirty: 1, operation: 'create', client_id: 'w1' },
    );
  });

  it('resolves the re-keyed row by client_id after a push and never replays the create', async () => {
    // The screen mounts while the create op is still pending...
    mockRow = { ...syncedWorkout, id: 'w1', is_dirty: 1, operation: 'create' };
    const instance = await renderActive();

    // ...then the sync engine pushes it: the local row is deleted and replaced
    // by the server row (server id, server started_at, client_id carried).
    // A stale-timestamp or stale-id lookup would miss this row, and the next
    // set log would re-insert a dirty create -> a duplicate workout on the
    // server.
    mockRow = syncedWorkout;
    mockLastSyncAt = '2026-02-03T10:00:00Z';
    await act(async () => {
      instance.update(<ActiveWorkoutScreen workoutId="w1" />);
      await Promise.resolve();
    });

    mockUpsertWorkout.mockClear();
    await logSet(instance);

    expect(mockFindWorkoutByClientID).toHaveBeenCalledWith('w1');
    expect(mockLogSet).toHaveBeenCalledWith('server-w1', 'we1', {
      weight_kg: 110,
      reps: 5,
      is_warmup: false,
    });
    // No create re-insert: the only local write carries the synced row.
    expect(mockUpsertWorkout).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: 'create' }),
    );
  });

  it('adds an exercise mid-workout through the API for a synced workout', async () => {
    const instance = await renderActive();

    await act(async () => {
      instance.root.findByProps({ testID: 'workout.addExercise' }).props.onPress();
    });
    expect(instance.root.findAllByProps({ testID: 'workout.addExercise.e1' })).toHaveLength(0);
    await act(async () => {
      await instance.root.findByProps({ testID: 'workout.addExercise.e2' }).props.onPress();
    });

    expect(mockAddExercise).toHaveBeenCalledWith('server-w1', { exercise_id: 'e2' });
    expect(mockUpsertWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'server-w1',
        exercises: expect.arrayContaining([expect.objectContaining({ id: 'we2' })]),
      }),
      { is_dirty: 0, operation: undefined, client_id: 'w1' },
    );
  });

  it('finishes the workout via the API', async () => {
    const onWorkoutFinished = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(<ActiveWorkoutScreen workoutId="w1" onWorkoutFinished={onWorkoutFinished} />);
    });
    currentInstance = instance!;

    await act(async () => {
      await instance!.root.findByProps({ testID: 'workout.finish' }).props.onPress();
    });

    expect(mockFinish).toHaveBeenCalledWith('server-w1');
    expect(onWorkoutFinished).toHaveBeenCalledWith(
      expect.objectContaining({ finished_at: '2026-01-01T09:00:00Z' }),
    );
  });

  it('marks a synced workout finish as a dirty update when the API is offline', async () => {
    mockFinish.mockRejectedValue(new Error('offline'));
    const instance = await renderActive();

    await act(async () => {
      await instance.root.findByProps({ testID: 'workout.finish' }).props.onPress();
    });

    expect(mockUpsertWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'server-w1', finished_at: expect.any(String) }),
      { is_dirty: 1, operation: 'update', client_id: 'w1' },
    );
  });

  it('does not write a finish response after the local database generation changes', async () => {
    let releaseFinish!: (workout: WorkoutLocalRow) => void;
    mockFinish.mockReturnValue(
      new Promise((resolve) => {
        releaseFinish = resolve;
      }),
    );
    const onWorkoutFinished = jest.fn();
    const instance = await renderActive();
    let finishPromise!: Promise<void>;

    await act(async () => {
      finishPromise = instance.root.findByProps({ testID: 'workout.finish' }).props.onPress();
      await Promise.resolve();
    });
    mockDataGeneration = 1;
    releaseFinish({ ...syncedWorkout, finished_at: '2026-01-01T09:00:00Z' });
    await act(async () => {
      await finishPromise;
    });

    expect(mockUpsertRemote).not.toHaveBeenCalled();
    expect(mockUpsertWorkout).not.toHaveBeenCalled();
    expect(onWorkoutFinished).not.toHaveBeenCalled();
  });
});
