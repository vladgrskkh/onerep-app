import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { Template } from '../../../../shared/api/gym';
import type { TemplateLocalRow } from '../../../../shared/db/database';

const mockGetExercises = jest.fn(() => [
  { id: 'e1', name: 'Bench Press' },
  { id: 'e2', name: 'Squat' },
]);
const mockUpsertTemplate = jest.fn<(row: unknown, sync?: object) => void>();
const mockFindTemplateByClientID = jest.fn<(clientId: string) => TemplateLocalRow | null>();
const mockUpsertRemote = jest.fn<(table: string, row: unknown) => void>();
const mockSync = jest.fn(async () => ({ lastSyncedAt: '2026-01-02T00:00:00Z' }));

jest.mock('../../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    getExercises: mockGetExercises,
    upsertTemplate: mockUpsertTemplate,
    findTemplateByClientID: mockFindTemplateByClientID,
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

async function renderCreate(onCreated?: (template: Template) => void) {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<CreateTemplateScreen onCreated={onCreated} />);
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
  mockFindTemplateByClientID.mockReturnValue(null);
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
      { is_dirty: 1, operation: 'create', client_id: expect.any(String) },
    );
    expect(mockSync).toHaveBeenCalled();
    const created = mockUpsertTemplate.mock.calls[0]?.[0] as Template;
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: created.id, name: 'Push day' }));
  });

  it('passes the server row to the callback after an online create re-keys the template', async () => {
    const onCreated = jest.fn();
    mockFindTemplateByClientID.mockReturnValue({
      id: 'server-t1',
      client_id: 'client-t1',
      name: 'Push day',
      is_public: false,
      created_at: '2026-02-03T12:00:00Z',
      updated_at: '2026-02-03T12:00:00Z',
      version: 1,
      is_dirty: 0,
      operation: null,
      last_synced_at: '2026-02-03T12:00:00Z',
    });
    const instance = await renderCreate(onCreated);

    await changeText(instance, 'createTemplate.name', 'Push day');
    await submit(instance);

    const created = mockUpsertTemplate.mock.calls[0]?.[0] as Template;
    expect(mockFindTemplateByClientID).toHaveBeenCalledWith(created.id);
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'server-t1', client_id: 'client-t1' }),
    );
  });

  it('publishes via the API when the toggle is on and the create was pushed', async () => {
    // Real server behavior: after the push the row has a server-assigned id
    // and server timestamps; only the client_id survives. Publishing must
    // resolve the server id via client_id — a created_at lookup would miss.
    const pushed: TemplateLocalRow = {
      id: 'server-t1',
      client_id: 'client-t1',
      name: 'Push day',
      is_public: false,
      created_at: '2026-02-03T12:00:00Z',
      updated_at: '2026-02-03T12:00:00Z',
      version: 1,
      is_dirty: 0,
      operation: null,
      last_synced_at: '2026-02-03T12:00:00Z',
    };
    mockFindTemplateByClientID.mockReturnValue(pushed);
    mockPublish.mockResolvedValue({ ...pushed, is_public: true });
    const instance = await renderCreate();

    await act(async () => {
      instance.root.findByProps({ testID: 'createTemplate.publish' }).props.onValueChange(true);
    });
    await changeText(instance, 'createTemplate.name', 'Push day');
    await submit(instance);

    const created = mockUpsertTemplate.mock.calls[0]?.[0] as Template;
    expect(mockFindTemplateByClientID).toHaveBeenCalledWith(created.id);
    expect(mockPublish).toHaveBeenCalledWith('server-t1');
    expect(mockUpsertRemote).toHaveBeenCalledWith(
      'templates',
      expect.objectContaining({ id: 'server-t1' }),
    );
  });

  it('does not publish when the create has not reached the server', async () => {
    // The pushed row is still the local dirty create (offline push): publish
    // would 404 on the client id, so the screen must skip it with a message.
    mockFindTemplateByClientID.mockReturnValue({
      id: 'client-t1',
      client_id: 'client-t1',
      name: 'Push day',
      is_public: false,
      created_at: '2026-02-03T12:00:00Z',
      updated_at: '2026-02-03T12:00:00Z',
      version: 1,
      is_dirty: 1,
      operation: 'create',
      last_synced_at: null,
    });
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
