import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { Template } from '../../../../shared/api/gym';
import type { TemplateLocalRow } from '../../../../shared/db/database';

const mockGetExercises = jest.fn(() => [
  { id: 'e1', name: 'Bench Press' },
  { id: 'e2', name: 'Squat' },
]);
const mockUpsertTemplate = jest.fn<(row: unknown, sync?: object) => void>();
const mockFindTemplateByCreatedAt = jest.fn<(createdAt: string) => TemplateLocalRow | null>();
const mockUpsertRemote = jest.fn<(table: string, row: unknown) => void>();
const mockSync = jest.fn(async () => ({ lastSyncedAt: '2026-01-02T00:00:00Z' }));

jest.mock('../../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    getExercises: mockGetExercises,
    upsertTemplate: mockUpsertTemplate,
    findTemplateByCreatedAt: mockFindTemplateByCreatedAt,
    upsertRemote: mockUpsertRemote,
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
import { CreateTemplateScreen } from '../CreateTemplateScreen';

async function renderCreate() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<CreateTemplateScreen />);
  });
  return instance!;
}

function changeText(instance: ReturnType<typeof create>, testID: string, value: string) {
  return act(async () => {
    instance.root.findByProps({ testID }).props.onChangeText(value);
  });
}

async function submit(instance: ReturnType<typeof create>) {
  await act(async () => {
    await instance.root.findByProps({ testID: 'createTemplate.submit' }).props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsertTemplate.mockReturnValue(undefined);
  mockUpsertRemote.mockReturnValue(undefined);
  mockFindTemplateByCreatedAt.mockReturnValue(null);
  mockPublish.mockResolvedValue({} as Template);
});

describe('CreateTemplateScreen', () => {
  it('validates the name before writing anything', async () => {
    const instance = await renderCreate();

    await submit(instance);

    expect(mockUpsertTemplate).not.toHaveBeenCalled();
    expect(instance.root.findByProps({ testID: 'createTemplate.name' }).props.error).toBe(
      'Name is required',
    );
  });

  it('writes a pending create with the added exercises and planned sets', async () => {
    const onCreated = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(<CreateTemplateScreen onCreated={onCreated} />);
    });

    await act(async () => {
      instance!.root.findByProps({ testID: 'createTemplate.addExercise.e1' }).props.onPress();
    });
    await act(async () => {
      instance!.root.findByProps({ testID: 'createTemplate.more.e1' }).props.onPress();
    });
    await changeText(instance!, 'createTemplate.name', 'Push day');
    await submit(instance!);

    expect(mockUpsertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Push day',
        is_public: false,
        created_by_user_id: 'u1',
        exercises: [{ exercise_id: 'e1', sort_order: 0, planned_sets: 4 }],
      }),
      { is_dirty: 1, operation: 'create' },
    );
    expect(mockSync).toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ name: 'Push day' }));
  });

  it('publishes via the API when the toggle is on and the create was pushed', async () => {
    const pushed = {
      id: 'server-t1',
      name: 'Push day',
      is_public: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      version: 1,
      is_dirty: 0,
      operation: null,
      last_synced_at: null,
    };
    mockFindTemplateByCreatedAt.mockReturnValue(pushed);
    mockPublish.mockResolvedValue({ ...pushed, is_public: true });
    const instance = await renderCreate();

    await act(async () => {
      instance.root.findByProps({ testID: 'createTemplate.publish' }).props.onValueChange(true);
    });
    await changeText(instance, 'createTemplate.name', 'Push day');
    await submit(instance);

    expect(mockPublish).toHaveBeenCalledWith('server-t1');
    expect(mockUpsertRemote).toHaveBeenCalledWith(
      'templates',
      expect.objectContaining({ id: 'server-t1' }),
    );
  });

  it('does not publish when the create has not reached the server', async () => {
    mockFindTemplateByCreatedAt.mockReturnValue(null);
    const instance = await renderCreate();

    await act(async () => {
      instance.root.findByProps({ testID: 'createTemplate.publish' }).props.onValueChange(true);
    });
    await changeText(instance, 'createTemplate.name', 'Push day');
    await submit(instance);

    expect(mockPublish).not.toHaveBeenCalled();
    expect(instance.root.findByProps({ testID: 'createTemplate.error' })).toBeTruthy();
  });
});
