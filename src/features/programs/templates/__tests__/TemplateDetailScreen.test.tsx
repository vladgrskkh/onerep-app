import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { Template } from '../../../../shared/api/gym';
import type { TemplateLocalRow } from '../../../../shared/db/database';

const template: Template = {
  id: 't1',
  name: 'Push day',
  description: 'Chest, shoulders, triceps',
  is_public: false,
  created_by_user_id: 'u1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  version: 1,
  exercises: [
    { exercise_id: 'e1', sort_order: 0, planned_sets: 5 },
    { exercise_id: 'e2', sort_order: 1, planned_sets: 4 },
  ],
};

const localTemplate: TemplateLocalRow = {
  ...template,
  client_id: 'client-t1',
  is_dirty: 0,
  operation: null,
  last_synced_at: '2026-01-02T00:00:00Z',
};

let mockRow: TemplateLocalRow | null;
const mockGetTemplate = jest.fn(() => mockRow);
const mockGetExercises = jest.fn(() => [
  { id: 'e1', name: 'Bench Press' },
  { id: 'e2', name: 'Overhead Press' },
]);
const mockUpsertTemplate = jest.fn<(row: unknown, sync?: object) => void>();
const mockUpsertRemote = jest.fn<(table: string, row: unknown) => void>();
const mockUpsertWorkout = jest.fn<(row: unknown, sync?: object) => void>();
const mockFindTemplateByClientID = jest.fn<(clientId: string) => TemplateLocalRow | null>();
const mockSync = jest.fn(async () => ({ lastSyncedAt: '2026-01-02T00:00:00Z' }));

jest.mock('../../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    getTemplate: mockGetTemplate,
    getExercises: mockGetExercises,
    upsertTemplate: mockUpsertTemplate,
    upsertRemote: mockUpsertRemote,
    upsertWorkout: mockUpsertWorkout,
    findTemplateByClientID: mockFindTemplateByClientID,
  })),
}));

jest.mock('../../../../shared/sync/useSync', () => ({
  useSync: () => ({ sync: mockSync, isSyncing: false, lastSyncAt: null, lastError: null }),
}));

jest.mock('../../../../features/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
  getUserMessage: (error: unknown, fallback: string) => {
    const candidate = error as { userMessage?: string; message?: string };
    return candidate.userMessage ?? candidate.message ?? fallback;
  },
}));

jest.mock('../../../../shared/api/gym', () => ({
  gymApi: {
    templates: {
      publish: jest.fn(async () => ({} as Template)),
    },
  },
}));

// eslint-disable-next-line import/first
import { gymApi } from '../../../../shared/api/gym';

const mockPublish = gymApi.templates.publish as jest.Mock<(...args: any[]) => any>;

// eslint-disable-next-line import/first
import { TemplateDetailScreen } from '../TemplateDetailScreen';

async function renderDetail() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<TemplateDetailScreen templateId="t1" />);
  });
  return instance!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRow = localTemplate;
  mockUpsertWorkout.mockReturnValue(undefined);
  mockUpsertTemplate.mockReturnValue(undefined);
  mockUpsertRemote.mockReturnValue(undefined);
  mockFindTemplateByClientID.mockReturnValue(null);
  mockPublish.mockResolvedValue(template);
});

describe('TemplateDetailScreen', () => {
  it('renders exercises with their planned sets', async () => {
    const instance = await renderDetail();

    expect(instance.root.findByProps({ children: 'Push day' })).toBeTruthy();
    expect(instance.root.findByProps({ children: 'Bench Press' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'templateDetail.plannedSets.e1' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'templateDetail.plannedSets.e2' })).toBeTruthy();
  });

  it('starts a workout as a local create op with the template id', async () => {
    const onWorkoutStarted = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(<TemplateDetailScreen templateId="t1" onWorkoutStarted={onWorkoutStarted} />);
    });

    await act(async () => {
      instance!.root.findByProps({ testID: 'templateDetail.startWorkout' }).props.onPress();
    });

    expect(mockUpsertWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: 't1',
        user_id: 'u1',
      }),
      { is_dirty: 1, operation: 'create', client_id: expect.any(String) },
    );
    expect(onWorkoutStarted).toHaveBeenCalledWith(expect.any(String));
    expect(mockSync).toHaveBeenCalled();
  });

  it('publishes through the API after resolving the pushed template id by client_id', async () => {
    // Real server behavior: the pushed row has a server id; the client_id is
    // the only stable handle from the pre-push row.
    mockFindTemplateByClientID.mockReturnValue({
      ...localTemplate,
      id: 'server-t1',
    });
    const instance = await renderDetail();

    await act(async () => {
      await instance.root.findByProps({ testID: 'templateDetail.publish' }).props.onPress();
    });

    expect(mockSync).toHaveBeenCalled();
    expect(mockFindTemplateByClientID).toHaveBeenCalledWith('client-t1');
    expect(mockPublish).toHaveBeenCalledWith('server-t1');
    expect(mockUpsertRemote).toHaveBeenCalledWith(
      'templates',
      expect.objectContaining({ id: 't1' }),
    );
  });

  it('does not publish a template whose create has not reached the server', async () => {
    const pending = {
      ...localTemplate,
      id: 'client-t1',
      is_dirty: 1,
      operation: 'create' as const,
      last_synced_at: null,
    };
    mockRow = pending;
    mockFindTemplateByClientID.mockReturnValue(pending);
    const instance = await renderDetail();

    await act(async () => {
      await instance.root.findByProps({ testID: 'templateDetail.publish' }).props.onPress();
    });

    expect(mockPublish).not.toHaveBeenCalled();
    expect(instance.root.findByProps({ testID: 'templateDetail.error' })).toBeTruthy();
  });

  it('forks as a local copy with a create op', async () => {
    const onForked = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(<TemplateDetailScreen templateId="t1" onForked={onForked} />);
    });

    await act(async () => {
      instance!.root.findByProps({ testID: 'templateDetail.fork' }).props.onPress();
    });

    expect(mockUpsertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Push day (copy)',
        created_by_user_id: 'u1',
        is_public: false,
      }),
      { is_dirty: 1, operation: 'create', client_id: expect.any(String) },
    );
    expect(onForked).toHaveBeenCalledWith(expect.objectContaining({ name: 'Push day (copy)' }));
  });

  it('shows a not-found state for an unknown template id', async () => {
    mockRow = null;
    const instance = await renderDetail();

    expect(instance.root.findByProps({ testID: 'templateDetail.notFound' })).toBeTruthy();
  });
});
