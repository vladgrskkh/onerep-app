import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { WorkoutLocalRow } from '../../../shared/db/database';

const syncedWorkout: WorkoutLocalRow = {
  id: 'w1',
  user_id: 'u1',
  template_id: 't1',
  started_at: '2026-01-01T08:00:00Z',
  created_at: '2026-01-01T08:00:00Z',
  updated_at: '2026-01-01T08:00:00Z',
  is_dirty: 0,
  operation: null,
  last_synced_at: null,
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
const mockGetWorkout = jest.fn(() => mockRow);
const mockFindWorkoutByStartedAt = jest.fn(() => null);
const mockGetExercises = jest.fn(() => [
  { id: 'e1', name: 'Bench Press' },
  { id: 'e2', name: 'Squat' },
]);
const mockGetTemplate = jest.fn(() => ({ id: 't1', name: 'Push day' }));
const mockUpsertWorkout = jest.fn<(row: unknown, sync?: object) => void>();
const mockUpsertRemote = jest.fn<(table: string, row: unknown) => void>();
const mockSync = jest.fn(async () => ({ lastSyncedAt: '2026-01-02T00:00:00Z' }));

jest.mock('../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    getWorkout: mockGetWorkout,
    findWorkoutByStartedAt: mockFindWorkoutByStartedAt,
    getExercises: mockGetExercises,
    getTemplate: mockGetTemplate,
    upsertWorkout: mockUpsertWorkout,
    upsertRemote: mockUpsertRemote,
  })),
}));

jest.mock('../../../shared/sync/useSync', () => ({
  useSync: () => ({ sync: mockSync, isSyncing: false, lastSyncAt: null, lastError: null }),
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

    expect(mockLogSet).toHaveBeenCalledWith('w1', 'we1', {
      weight_kg: 110,
      reps: 5,
      is_warmup: false,
    });
    expect(instance.root.findByProps({ testID: 'workout.prBadge' })).toBeTruthy();
    expect(mockUpsertWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: expect.arrayContaining([
          expect.objectContaining({
            id: 'we1',
            sets: expect.arrayContaining([expect.objectContaining({ id: 's2', is_pr: true })]),
          }),
        ]),
      }),
      { is_dirty: 0, operation: undefined },
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
      'w1',
      'we1',
      expect.objectContaining({ rest_seconds: 90 }),
    );
  });

  it('keeps a pending-create workout local without calling the logSet API', async () => {
    mockRow = { ...syncedWorkout, is_dirty: 1, operation: 'create' };
    const instance = await renderActive();

    await logSet(instance);

    expect(mockLogSet).not.toHaveBeenCalled();
    expect(mockUpsertWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: expect.arrayContaining([
          expect.objectContaining({ sets: expect.arrayContaining([expect.anything()]) }),
        ]),
      }),
      { is_dirty: 1, operation: 'create' },
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

    expect(mockAddExercise).toHaveBeenCalledWith('w1', { exercise_id: 'e2' });
    expect(mockUpsertWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: expect.arrayContaining([expect.objectContaining({ id: 'we2' })]),
      }),
      { is_dirty: 0, operation: undefined },
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

    expect(mockFinish).toHaveBeenCalledWith('w1');
    expect(onWorkoutFinished).toHaveBeenCalledWith(
      expect.objectContaining({ finished_at: '2026-01-01T09:00:00Z' }),
    );
  });
});
