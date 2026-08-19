import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { WorkoutLocalRow } from '../../../shared/db/database';
import type { HistorySet } from '../workoutHistoryModel';

const benchSets: HistorySet[] = [
  {
    id: 's1',
    set_number: 1,
    weight_kg: 100,
    reps: 5,
    rpe: 8,
    is_warmup: false,
    is_pr: true,
    estimated_1rm: 116.7,
  },
  { id: 's2', set_number: 2, weight_kg: 80, reps: 10, is_warmup: true },
];

const workout: WorkoutLocalRow = {
  id: 'w1',
  user_id: 'u1',
  template_id: 't1',
  started_at: '2026-02-05T18:00:00Z',
  finished_at: '2026-02-05T19:10:00Z',
  notes: 'Felt strong today',
  created_at: '2026-02-05T18:00:00Z',
  updated_at: '2026-02-05T19:10:00Z',
  exercises: [
    {
      id: 'we1',
      exercise_id: 'e1',
      sort_order: 0,
      sets: benchSets,
    },
    { id: 'we2', exercise_id: 'e2', sort_order: 1, sets: [] },
  ],
  is_dirty: 0,
  operation: null,
  last_synced_at: null,
};

const mockGetWorkout = jest.fn<(id: string) => WorkoutLocalRow | null>(() => workout);
const mockGetExercises = jest.fn(() => [
  { id: 'e1', name: 'Bench Press' },
  { id: 'e2', name: 'Squat' },
]);
const mockGetTemplate = jest.fn(() => ({ id: 't1', name: 'Push day' }));

jest.mock('../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    getWorkout: mockGetWorkout,
    getExercises: mockGetExercises,
    getTemplate: mockGetTemplate,
  })),
}));

// eslint-disable-next-line import/first
import { WorkoutDetailScreen } from '../WorkoutDetailScreen';

async function renderDetail(workoutId: string) {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<WorkoutDetailScreen workoutId={workoutId} />);
  });
  return instance!;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('WorkoutDetailScreen', () => {
  it('renders the workout name, date and duration', async () => {
    const instance = await renderDetail('w1');

    const tree = JSON.stringify(instance.toJSON());
    expect(tree).toContain('Push day');
    expect(tree).toContain('1 h 10 min');
  });

  it('renders notes, every exercise and its sets', async () => {
    const instance = await renderDetail('w1');

    expect(instance.root.findByProps({ testID: 'workoutDetail.notes' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'workoutDetail.exercise.we1' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'workoutDetail.exercise.we2' })).toBeTruthy();
    expect(JSON.stringify(instance.toJSON())).toContain('Bench Press');
    expect(instance.root.findByProps({ testID: 'workoutDetail.exercise.we1.set.s1' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'workoutDetail.exercise.we1.set.s2' })).toBeTruthy();
  });

  it('shows e1RM, RPE and warmup details on sets', async () => {
    const instance = await renderDetail('w1');

    const tree = JSON.stringify(instance.toJSON());
    expect(tree).toContain('"100"," kg × ","5"');
    expect(tree).toContain('"RPE ","8"');
    expect(tree).toContain('"e1RM ","117"');
    expect(tree).toContain('"80"," kg × ","10"');
  });

  it('renders the not-found state with a back button', async () => {
    mockGetWorkout.mockReturnValueOnce(null);
    const onGoBack = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(<WorkoutDetailScreen workoutId="missing" onGoBack={onGoBack} />);
    });

    expect(instance!.root.findByProps({ testID: 'workoutDetail.notFound' })).toBeTruthy();
    await act(async () => {
      instance!.root.findByProps({ testID: 'workoutDetail.back' }).props.onPress();
    });
    expect(onGoBack).toHaveBeenCalled();
  });
});
