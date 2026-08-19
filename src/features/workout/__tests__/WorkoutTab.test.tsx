import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { WorkoutLocalRow } from '../../../shared/db/database';
const activeWorkout = {
  id: 'w-active',
  user_id: 'u1',
  started_at: '2026-02-06T10:00:00Z',
  created_at: '2026-02-06T10:00:00Z',
  updated_at: '2026-02-06T10:00:00Z',
  is_dirty: 1,
  operation: 'create',
  last_synced_at: null,
} as WorkoutLocalRow;

let mockWorkouts: WorkoutLocalRow[];

const mockGetWorkouts = jest.fn(() => mockWorkouts);
const mockGetWorkout = jest.fn<(id: string) => WorkoutLocalRow | null>(() => null);
const mockFindWorkoutByClientID = jest.fn<(clientId: string) => WorkoutLocalRow | null>(() => null);

jest.mock('../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    getWorkouts: mockGetWorkouts,
    getWorkout: mockGetWorkout,
    findWorkoutByClientID: mockFindWorkoutByClientID,
  })),
}));

jest.mock('../../../shared/sync/useSync', () => ({
  useSync: () => ({ sync: jest.fn(), isSyncing: false, lastSyncAt: null, lastError: null }),
}));

jest.mock('../ActiveWorkoutScreen', () => ({
  ActiveWorkoutScreen: jest.fn(() => null),
}));

jest.mock('../WorkoutListScreen', () => ({
  WorkoutListScreen: jest.fn(() => null),
}));

jest.mock('../WorkoutDetailScreen', () => ({
  WorkoutDetailScreen: jest.fn(() => null),
}));

// eslint-disable-next-line import/first
import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
// eslint-disable-next-line import/first
import { WorkoutListScreen } from '../WorkoutListScreen';
// eslint-disable-next-line import/first
import { WorkoutDetailScreen } from '../WorkoutDetailScreen';
// eslint-disable-next-line import/first
import { WorkoutTab, findActiveWorkout } from '../WorkoutTab';

type WorkoutStub = { id: string };
type ActiveWorkoutTestProps = { workoutId: string; onWorkoutFinished: () => void };
type WorkoutListTestProps = { onSelectWorkout: (workout: WorkoutStub) => void };
type WorkoutDetailTestProps = { workoutId: string; onGoBack: () => void };
type ComponentMock<Props> = jest.MockedFunction<(props: Props) => null>;

const mockActive = ActiveWorkoutScreen as unknown as ComponentMock<ActiveWorkoutTestProps>;
const mockList = WorkoutListScreen as unknown as ComponentMock<WorkoutListTestProps>;
const mockDetail = WorkoutDetailScreen as unknown as ComponentMock<WorkoutDetailTestProps>;

function lastProps<Props>(mock: ComponentMock<Props>): Props {
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  if (!call) {
    throw new Error('Expected the component mock to have been called');
  }
  return call[0];
}

function renderTab(props: { activeWorkoutId?: string; onClearActiveWorkout?: () => void } = {}) {
  let instance: ReturnType<typeof create>;
  act(() => {
    instance = create(<WorkoutTab {...props} />);
  });
  return instance!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWorkouts = [];
  mockFindWorkoutByClientID.mockReturnValue(null);
});

describe('findActiveWorkout', () => {
  it('returns the workout without a finished_at', () => {
    mockWorkouts = [
      { id: 'done', finished_at: '2026-02-05T10:00:00Z' } as WorkoutLocalRow,
      activeWorkout,
    ];
    expect(findActiveWorkout()?.id).toBe('w-active');
  });
});

describe('WorkoutTab', () => {
  it('shows the active workout screen when an unfinished workout exists', () => {
    mockWorkouts = [activeWorkout];
    renderTab();

    expect(mockActive.mock.calls[0][0]).toMatchObject({ workoutId: 'w-active' });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('shows history when no active workout exists', () => {
    mockWorkouts = [];
    renderTab();

    expect(mockList).toHaveBeenCalled();
    expect(mockActive).not.toHaveBeenCalled();
  });

  it('resolves an active workout started from Programs via the route param', () => {
    mockWorkouts = [];
    mockFindWorkoutByClientID.mockReturnValue(activeWorkout);
    renderTab({ activeWorkoutId: 'w-active' });

    expect(mockActive.mock.calls[0][0]).toMatchObject({ workoutId: 'w-active' });
  });

  it('returns to history and clears the param when the workout finishes', () => {
    mockWorkouts = [activeWorkout];
    const onClearActiveWorkout = jest.fn();
    renderTab({ onClearActiveWorkout });

    act(() => {
      lastProps(mockActive).onWorkoutFinished();
    });

    expect(mockList).toHaveBeenCalled();
    expect(onClearActiveWorkout).toHaveBeenCalled();
  });

  it('opens the workout detail from the history row and goes back', () => {
    mockWorkouts = [];
    renderTab();

    act(() => {
      lastProps(mockList).onSelectWorkout({ id: 'w1' });
    });
    expect(mockDetail.mock.calls[0][0]).toMatchObject({ workoutId: 'w1' });

    act(() => {
      lastProps(mockDetail).onGoBack();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});
