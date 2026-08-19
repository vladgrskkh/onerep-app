import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { WorkoutLocalRow } from '../../../shared/db/database';

function daysAgoIso(days: number, hour = 9): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const workouts: WorkoutLocalRow[] = [
  {
    id: 'w1',
    user_id: 'u1',
    template_id: 't1',
    started_at: daysAgoIso(1, 18),
    finished_at: new Date(new Date(daysAgoIso(1, 18)).getTime() + 70 * 60_000).toISOString(),
    created_at: daysAgoIso(1, 18),
    updated_at: daysAgoIso(1, 18),
    exercises: [
      {
        id: 'we1',
        exercise_id: 'e1',
        sort_order: 0,
        sets: [
          { id: 's1', set_number: 1, weight_kg: 100, reps: 5, is_warmup: false },
          { id: 's2', set_number: 2, weight_kg: 100, reps: 5, is_warmup: false },
        ],
      },
    ],
    is_dirty: 0,
    operation: null,
    last_synced_at: null,
  },
  {
    id: 'w2',
    user_id: 'u1',
    started_at: daysAgoIso(2),
    finished_at: new Date(new Date(daysAgoIso(2)).getTime() + 45 * 60_000).toISOString(),
    created_at: daysAgoIso(2),
    updated_at: daysAgoIso(2),
    exercises: [
      { id: 'we2', exercise_id: 'e2', sort_order: 0, sets: [] },
      { id: 'we3', exercise_id: 'e3', sort_order: 1, sets: [] },
    ],
    is_dirty: 0,
    operation: null,
    last_synced_at: null,
  },
  {
    id: 'active-w1',
    user_id: 'u1',
    started_at: daysAgoIso(0),
    created_at: daysAgoIso(0),
    updated_at: daysAgoIso(0),
    is_dirty: 1,
    operation: 'create',
    last_synced_at: null,
  },
];

const mockGetWorkouts = jest.fn(() => workouts);
const mockGetTemplate = jest.fn((id: string) => (id === 't1' ? { id: 't1', name: 'Push day' } : null));

jest.mock('../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    getWorkouts: mockGetWorkouts,
    getTemplate: mockGetTemplate,
  })),
}));

jest.mock('../../../shared/sync/useSync', () => ({
  useSync: () => ({ sync: jest.fn(), isSyncing: false, lastSyncAt: null, lastError: null }),
}));

// eslint-disable-next-line import/first
import { WorkoutListScreen, groupByDay, readHistory } from '../WorkoutListScreen';

async function renderList() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<WorkoutListScreen />);
  });
  return instance!;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('readHistory', () => {
  it('keeps only finished workouts, newest first', () => {
    const history = readHistory();
    expect(history.map((workout) => workout.id)).toEqual(['w1', 'w2']);
  });

  it('groups workouts by day label', () => {
    const days = groupByDay(readHistory());
    expect(days).toHaveLength(2);
    expect(days[0].label).toBe('Yesterday');
    expect(days[1].label).not.toBe('Yesterday');
    expect(days[0].workouts).toHaveLength(1);
    expect(days[1].workouts).toHaveLength(1);
  });
});

describe('WorkoutListScreen', () => {
  it('renders finished workouts with exercise counts and duration', async () => {
    const instance = await renderList();

    expect(instance.root.findByProps({ testID: 'workoutList.row.w1' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'workoutList.row.w2' })).toBeTruthy();
    expect(instance.root.findAllByProps({ testID: 'workoutList.row.active-w1' })).toHaveLength(0);
    const tree = JSON.stringify(instance.toJSON());
    expect(tree).toContain('Push day');
    expect(tree).toContain('"1"," ","exercise"');
    expect(tree).toContain('"2"," ","exercises"');
    expect(tree).toContain('1 h 10 min');
  });

  it('shows the empty state when there is no history', async () => {
    mockGetWorkouts.mockReturnValueOnce([]);
    const instance = await renderList();

    expect(instance.root.findByProps({ testID: 'workoutList.empty' })).toBeTruthy();
  });

  it('calls onSelectWorkout with the tapped workout', async () => {
    const onSelectWorkout = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(<WorkoutListScreen onSelectWorkout={onSelectWorkout} />);
    });

    await act(async () => {
      instance!.root.findByProps({ testID: 'workoutList.row.w2' }).props.onPress();
    });

    expect(onSelectWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 'w2' }));
  });
});
