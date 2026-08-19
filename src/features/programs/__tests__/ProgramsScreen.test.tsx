import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

const mockStartWorkoutFromTemplate = jest.fn((template: { id: string }, _userId: string) => ({
  id: `workout-for-${template.id}`,
}));
const mockSync = jest.fn(async () => ({ lastSyncedAt: '2026-02-03T00:00:00Z' }));

jest.mock('../../../shared/sync/useSync', () => ({
  useSync: () => ({ sync: mockSync, isSyncing: false, lastSyncAt: null, lastError: null }),
}));

jest.mock('../../../features/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
  getUserMessage: (error: unknown, fallback: string) => fallback,
}));

jest.mock('../../../features/workout/workoutModel', () => ({
  startWorkoutFromTemplate: (template: { id: string }, userId: string) =>
    mockStartWorkoutFromTemplate(template, userId),
}));

jest.mock('../../../features/programs/templates/TemplateListScreen', () => ({
  TemplateListScreen: jest.fn(() => null),
}));

jest.mock('../../../features/programs/exercises/ExerciseListScreen', () => ({
  ExerciseListScreen: jest.fn(() => null),
}));

jest.mock('../../../features/programs/templates/TemplateDetailScreen', () => ({
  TemplateDetailScreen: jest.fn(() => null),
}));

jest.mock('../../../features/programs/templates/CreateTemplateScreen', () => ({
  CreateTemplateScreen: jest.fn(() => null),
}));

jest.mock('../../../features/programs/exercises/ExerciseDetailScreen', () => ({
  ExerciseDetailScreen: jest.fn(() => null),
}));

jest.mock('../../../features/programs/exercises/CreateExerciseScreen', () => ({
  CreateExerciseScreen: jest.fn(() => null),
}));

// eslint-disable-next-line import/first
import { CreateExerciseScreen } from '../exercises/CreateExerciseScreen';
// eslint-disable-next-line import/first
import { ExerciseDetailScreen } from '../exercises/ExerciseDetailScreen';
// eslint-disable-next-line import/first
import { ExerciseListScreen } from '../exercises/ExerciseListScreen';
// eslint-disable-next-line import/first
import { CreateTemplateScreen } from '../templates/CreateTemplateScreen';
// eslint-disable-next-line import/first
import { TemplateDetailScreen } from '../templates/TemplateDetailScreen';
// eslint-disable-next-line import/first
import { TemplateListScreen } from '../templates/TemplateListScreen';
// eslint-disable-next-line import/first
import { ProgramsScreen } from '../ProgramsScreen';

type TemplateStub = { id: string };
type ExerciseStub = { id: string };
type TemplateListTestProps = {
  onSelectTemplate: (template: TemplateStub) => void;
  onStartWorkout: (template: TemplateStub) => void;
  onEditTemplate: (template: TemplateStub) => void;
  onCreateTemplate: () => void;
};
type ExerciseListTestProps = {
  onSelectExercise: (exercise: ExerciseStub) => void;
  onCreateExercise: () => void;
};
type TemplateDetailTestProps = {
  templateId: string;
  onGoBack: () => void;
  onWorkoutStarted: (workoutId: string) => void;
  onForked: () => void;
};
type CreateTemplateTestProps = { onCreated: (template: TemplateStub) => void };
type ExerciseDetailTestProps = { exerciseId: string; onGoBack: () => void };
type CreateExerciseTestProps = { onCreated: () => void };
type ComponentMock<Props> = jest.MockedFunction<(props: Props) => null>;

const mockTemplateList = TemplateListScreen as unknown as ComponentMock<TemplateListTestProps>;
const mockExerciseList = ExerciseListScreen as unknown as ComponentMock<ExerciseListTestProps>;
const mockTemplateDetail = TemplateDetailScreen as unknown as ComponentMock<TemplateDetailTestProps>;
const mockCreateTemplate = CreateTemplateScreen as unknown as ComponentMock<CreateTemplateTestProps>;
const mockExerciseDetail = ExerciseDetailScreen as unknown as ComponentMock<ExerciseDetailTestProps>;
const mockCreateExercise = CreateExerciseScreen as unknown as ComponentMock<CreateExerciseTestProps>;

function lastProps<Props>(mock: ComponentMock<Props>): Props {
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  if (!call) {
    throw new Error('Expected the component mock to have been called');
  }
  return call[0];
}

function renderPrograms(onWorkoutStarted?: (workoutId: string) => void) {
  let instance: ReturnType<typeof create>;
  act(() => {
    instance = create(<ProgramsScreen onWorkoutStarted={onWorkoutStarted} />);
  });
  return instance!;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ProgramsScreen', () => {
  it('shows templates by default and switches to exercises via the segment', () => {
    const instance = renderPrograms();

    expect(mockTemplateList).toHaveBeenCalled();

    act(() => {
      instance.root.findByProps({ testID: 'programs.segment.exercises' }).props.onPress();
    });
    expect(mockExerciseList).toHaveBeenCalled();

    act(() => {
      instance.root.findByProps({ testID: 'programs.segment.templates' }).props.onPress();
    });
    expect(mockTemplateList).toHaveBeenCalledTimes(2);
  });

  it('starts a workout from a template and notifies the parent', () => {
    const onWorkoutStarted = jest.fn();
    renderPrograms(onWorkoutStarted);

    act(() => {
      lastProps(mockTemplateList).onStartWorkout({ id: 't1' });
    });

    expect(mockStartWorkoutFromTemplate).toHaveBeenCalledWith({ id: 't1' }, 'u1');
    expect(onWorkoutStarted).toHaveBeenCalledWith('workout-for-t1');
    expect(mockSync).toHaveBeenCalled();
  });

  it('navigates into template detail, create, and back to the list', () => {
    renderPrograms();

    act(() => {
      lastProps(mockTemplateList).onSelectTemplate({ id: 't1' });
    });
    expect(mockTemplateDetail.mock.calls[0][0]).toMatchObject({ templateId: 't1' });

    act(() => {
      lastProps(mockTemplateDetail).onGoBack();
    });
    expect(mockTemplateList).toHaveBeenCalledTimes(2);

    act(() => {
      lastProps(mockTemplateList).onCreateTemplate();
    });
    expect(mockCreateTemplate).toHaveBeenCalled();

    act(() => {
      lastProps(mockCreateTemplate).onCreated({ id: 't9' });
    });
    expect(mockTemplateDetail.mock.calls[mockTemplateDetail.mock.calls.length - 1][0]).toMatchObject({ templateId: 't9' });
  });

  it('navigates into exercise detail and create', () => {
    const instance = renderPrograms();

    act(() => {
      instance.root.findByProps({ testID: 'programs.segment.exercises' }).props.onPress();
    });
    act(() => {
      lastProps(mockExerciseList).onSelectExercise({ id: 'e1' });
    });
    expect(mockExerciseDetail.mock.calls[0][0]).toMatchObject({ exerciseId: 'e1' });

    act(() => {
      lastProps(mockExerciseDetail).onGoBack();
    });
    act(() => {
      lastProps(mockExerciseList).onCreateExercise();
    });
    expect(mockCreateExercise).toHaveBeenCalled();

    act(() => {
      lastProps(mockCreateExercise).onCreated();
    });
    expect(mockExerciseList).toHaveBeenCalledTimes(3);
  });

  it('forwards the workout-started callback from template detail', () => {
    const onWorkoutStarted = jest.fn();
    renderPrograms(onWorkoutStarted);

    act(() => {
      lastProps(mockTemplateList).onSelectTemplate({ id: 't1' });
    });
    act(() => {
      lastProps(mockTemplateDetail).onWorkoutStarted('w-x');
    });

    expect(onWorkoutStarted).toHaveBeenCalledWith('w-x');
  });
});
