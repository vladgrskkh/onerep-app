import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { Template } from '../../../../shared/api/gym';
import type { TemplateLocalRow } from '../../../../shared/db/database';

const myTemplates: TemplateLocalRow[] = [
  {
    id: 't1',
    name: 'Push day',
    is_public: false,
    created_by_user_id: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    exercises: [
      { exercise_id: 'e1', sort_order: 0, planned_sets: 5 },
      { exercise_id: 'e2', sort_order: 1, planned_sets: 4 },
    ],
    is_dirty: 0,
    operation: null,
    last_synced_at: null,
  },
  {
    id: 't2',
    name: 'Someone else',
    is_public: false,
    created_by_user_id: 'u2',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    is_dirty: 0,
    operation: null,
    last_synced_at: null,
  },
];

const publicTemplates: Template[] = [
  {
    id: 't3',
    name: 'Full body',
    is_public: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    exercises: [{ exercise_id: 'e1', sort_order: 0, planned_sets: 3 }],
  },
];

const mockGetTemplates = jest.fn(() => myTemplates);
const mockSync = jest.fn(async () => ({ lastSyncedAt: '2026-01-02T00:00:00Z' }));

jest.mock('../../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({ getTemplates: mockGetTemplates })),
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
      list: jest.fn(async () => [] as Template[]),
    },
  },
}));

// eslint-disable-next-line import/first
import { gymApi } from '../../../../shared/api/gym';

const mockListTemplates = gymApi.templates.list as jest.Mock<(...args: any[]) => any>;

// eslint-disable-next-line import/first
import { TemplateListScreen } from '../TemplateListScreen';

async function renderList() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<TemplateListScreen />);
  });
  return instance!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListTemplates.mockResolvedValue([]);
});

describe('TemplateListScreen', () => {
  it('renders only the current user templates with exercise-count badges', async () => {
    const instance = await renderList();

    expect(instance.root.findByProps({ testID: 'templates.row.t1' })).toBeTruthy();
    expect(instance.root.findAllByProps({ testID: 'templates.row.t2' })).toHaveLength(0);
    expect(instance.root.findByProps({ testID: 'templates.count.t1' })).toBeTruthy();
  });

  it('calls the start and edit callbacks from the row buttons', async () => {
    const onStartWorkout = jest.fn();
    const onEditTemplate = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(
        <TemplateListScreen onStartWorkout={onStartWorkout} onEditTemplate={onEditTemplate} />,
      );
    });

    await act(async () => {
      instance!.root.findByProps({ testID: 'templates.start.t1' }).props.onPress();
    });
    await act(async () => {
      instance!.root.findByProps({ testID: 'templates.edit.t1' }).props.onPress();
    });

    expect(onStartWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(onEditTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it('fetches public templates with the public=true query on the Public segment', async () => {
    mockListTemplates.mockResolvedValue(publicTemplates);
    const instance = await renderList();

    await act(async () => {
      instance.root.findByProps({ testID: 'templates.segment.public' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockListTemplates).toHaveBeenCalledWith({ public: true });
    expect(instance.root.findByProps({ testID: 'templates.row.t3' })).toBeTruthy();
  });

  it('surfaces the API user message when the public fetch fails', async () => {
    mockListTemplates.mockRejectedValue({
      status: 500,
      message: 'boom',
      userMessage: 'Could not load templates',
    });
    const instance = await renderList();

    await act(async () => {
      instance.root.findByProps({ testID: 'templates.segment.public' }).props.onPress();
      await Promise.resolve();
    });

    expect(instance.root.findByProps({ testID: 'templates.error' }).props.children).toBe(
      'Could not load templates',
    );
  });

  it('syncs on pull-to-refresh on the My segment', async () => {
    const instance = await renderList();
    const list = instance.root.findByProps({ testID: 'templates.list' });

    await act(async () => {
      await list.props.refreshControl.props.onRefresh();
    });

    expect(mockSync).toHaveBeenCalledTimes(1);
  });
});
