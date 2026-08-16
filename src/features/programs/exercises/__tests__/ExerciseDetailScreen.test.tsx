import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { Exercise } from '../../../../shared/api/gym';

const exercise: Exercise = {
  id: 'e1',
  name: 'Bench Press',
  description: 'Barbell horizontal press',
  notes: 'Keep shoulder blades retracted',
  is_built_in: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  version: 1,
  media: [
    { id: 'm1', media_type: 'photo', sort_order: 0, s3_key: 'media/e1/photo.jpg' },
  ],
  muscle_groups: [
    { id: 1, is_primary: true },
    { id: 4, is_primary: false },
  ],
};

let mockExercise: Exercise | null;
const mockGetExercise = jest.fn(() => mockExercise);

jest.mock('../../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({ getExercise: mockGetExercise })),
}));

// eslint-disable-next-line import/first
import { ExerciseDetailScreen } from '../ExerciseDetailScreen';

async function renderDetail(exerciseId: string) {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<ExerciseDetailScreen exerciseId={exerciseId} />);
  });
  return instance!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExercise = exercise;
});

describe('ExerciseDetailScreen', () => {
  it('renders the exercise info and flags primary muscle groups', async () => {
    const instance = await renderDetail('e1');

    expect(instance.root.findByProps({ children: 'Bench Press' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'exerciseDetail.primary.1' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'exerciseDetail.muscle.4' })).toBeTruthy();
  });

  it('renders a media placeholder keyed on s3_key availability', async () => {
    const instance = await renderDetail('e1');

    const placeholder = instance.root.findByProps({ testID: 'exerciseDetail.media.m1' });
    expect(placeholder).toBeTruthy();
    expect(instance.root.findByProps({ children: 'media/e1/photo.jpg' })).toBeTruthy();
  });

  it('shows a not-found state for an unknown exercise id', async () => {
    mockExercise = null;
    const instance = await renderDetail('missing');

    expect(instance.root.findByProps({ testID: 'exerciseDetail.notFound' })).toBeTruthy();
  });
});
