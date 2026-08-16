import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import type { Exercise } from '../../../../shared/api/gym';
import type { ExerciseLocalRow } from '../../../../shared/db/database';

const mockUpsertExercise = jest.fn<
  (exercise: Exercise, sync?: { is_dirty?: number; operation?: string; client_id?: string }) => void
>();
const mockFindExerciseByClientID = jest.fn<(clientId: string) => ExerciseLocalRow | null>();
const mockUpsertRemote = jest.fn<(table: string, row: unknown) => void>();
const mockSync = jest.fn(async () => ({ lastSyncedAt: '2026-01-02T00:00:00Z' }));

jest.mock('../../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    upsertExercise: mockUpsertExercise,
    findExerciseByClientID: mockFindExerciseByClientID,
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

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('../../../../shared/api/gym', () => ({
  gymApi: {
    exercises: {
      uploadMedia: jest.fn(async () => ({ id: 'm', s3_key: 'k', upload_url: 'u' })),
      get: jest.fn(async () => ({} as Exercise)),
    },
  },
  putFile: jest.fn(async () => undefined),
}));

// eslint-disable-next-line import/first
import * as ImagePicker from 'expo-image-picker';
// eslint-disable-next-line import/first
import { gymApi, putFile } from '../../../../shared/api/gym';

const mockLaunchImageLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock<(...args: any[]) => any>;
const mockUploadMedia = gymApi.exercises.uploadMedia as jest.Mock<(...args: any[]) => any>;
const mockGetExercise = gymApi.exercises.get as jest.Mock<(...args: any[]) => any>;
const mockPutFile = putFile as jest.Mock<(...args: any[]) => any>;

// eslint-disable-next-line import/first
import { CreateExerciseScreen } from '../CreateExerciseScreen';

async function renderCreate() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<CreateExerciseScreen />);
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
    await instance.root.findByProps({ testID: 'createExercise.submit' }).props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsertExercise.mockReturnValue(undefined);
  mockFindExerciseByClientID.mockReturnValue(null);
  mockSync.mockResolvedValue({ lastSyncedAt: '2026-01-02T00:00:00Z' });
  mockLaunchImageLibrary.mockResolvedValue({ canceled: true, assets: [] });
});

describe('CreateExerciseScreen', () => {
  it('validates the name and shows an error', async () => {
    const instance = await renderCreate();

    await submit(instance);

    expect(mockUpsertExercise).not.toHaveBeenCalled();
    expect(instance.root.findByProps({ testID: 'createExercise.name' }).props.error).toBe(
      'Name is required',
    );
  });

  it('writes a pending create to the local db and triggers sync', async () => {
    const onCreated = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(<CreateExerciseScreen onCreated={onCreated} />);
    });

    await changeText(instance!, 'createExercise.name', 'Dumbbell Fly');
    await submit(instance!);

    expect(mockUpsertExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Dumbbell Fly',
        is_built_in: false,
        created_by_user_id: 'u1',
      }),
      { is_dirty: 1, operation: 'create', client_id: expect.any(String) },
    );
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dumbbell Fly' }));
  });

  it('records muscle group selection with the first pick as primary', async () => {
    const instance = await renderCreate();

    await act(async () => {
      instance.root.findByProps({ testID: 'createExercise.muscle.chest' }).props.onPress();
    });
    await act(async () => {
      instance.root.findByProps({ testID: 'createExercise.muscle.back' }).props.onPress();
    });
    await changeText(instance, 'createExercise.name', 'Pullover');
    await submit(instance);

    expect(mockUpsertExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        muscle_groups: [
          { id: 1, is_primary: true },
          { id: 6, is_primary: false },
        ],
      }),
      expect.anything(),
    );
  });

  it('uploads the picked photo via the presigned flow after the create was pushed', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/photo.jpg', mimeType: 'image/jpeg', fileName: 'photo.jpg' }],
    });
    // Real server behavior: after the push the row has a server-assigned id
    // AND server-assigned timestamps; only the client_id survives. The screen
    // must resolve the pushed row via client_id — a created_at lookup would
    // miss (server overwrote it) and the upload would dead-end.
    const pushed: ExerciseLocalRow = {
      id: 'server-e1',
      client_id: 'client-e1',
      name: 'Dumbbell Fly',
      is_built_in: false,
      created_at: '2026-02-03T12:00:00Z',
      updated_at: '2026-02-03T12:00:00Z',
      version: 1,
      is_dirty: 0,
      operation: null,
      last_synced_at: '2026-02-03T12:00:00Z',
    };
    mockFindExerciseByClientID.mockReturnValue(pushed);
    mockUploadMedia.mockResolvedValue({
      id: 'media-1',
      s3_key: 'media/server-e1/photo.jpg',
      upload_url: 'https://s3.example.com/put',
    });
    mockGetExercise.mockResolvedValue({
      ...pushed,
      media: [{ id: 'media-1', media_type: 'photo', sort_order: 0, s3_key: 'media/server-e1/photo.jpg' }],
    });
    const instance = await renderCreate();

    await act(async () => {
      await instance.root.findByProps({ testID: 'createExercise.pickPhoto' }).props.onPress();
    });
    expect(instance.root.findByProps({ testID: 'createExercise.photoPreview' })).toBeTruthy();

    await changeText(instance, 'createExercise.name', 'Dumbbell Fly');
    await submit(instance);

    const created = mockUpsertExercise.mock.calls[0]?.[0] as Exercise;
    expect(mockFindExerciseByClientID).toHaveBeenCalledWith(created.id);
    expect(mockUploadMedia).toHaveBeenCalledWith('server-e1', {
      media_type: 'photo',
      content_type: 'image/jpeg',
    });
    expect(mockPutFile).toHaveBeenCalledWith(
      'https://s3.example.com/put',
      { uri: 'file:///tmp/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' },
      'image/jpeg',
    );
    expect(mockUpsertRemote).toHaveBeenCalledWith(
      'exercises',
      expect.objectContaining({ id: 'server-e1' }),
    );
  });

  it('still saves the exercise locally when the photo upload fails', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/photo.jpg', mimeType: 'image/jpeg', fileName: 'photo.jpg' }],
    });
    const pushed: ExerciseLocalRow = {
      id: 'server-e1',
      client_id: 'client-e1',
      name: 'Dumbbell Fly',
      is_built_in: false,
      created_at: '2026-02-03T12:00:00Z',
      updated_at: '2026-02-03T12:00:00Z',
      version: 1,
      is_dirty: 0,
      operation: null,
      last_synced_at: '2026-02-03T12:00:00Z',
    };
    mockFindExerciseByClientID.mockReturnValue(pushed);
    mockUploadMedia.mockRejectedValue(new Error('offline'));
    const instance = await renderCreate();

    await act(async () => {
      await instance.root.findByProps({ testID: 'createExercise.pickPhoto' }).props.onPress();
    });
    await changeText(instance, 'createExercise.name', 'Dumbbell Fly');
    await submit(instance);

    expect(mockUpsertExercise).toHaveBeenCalled();
    expect(instance.root.findByProps({ testID: 'createExercise.error' })).toBeTruthy();
  });

  it('keeps the photo pending with a clear message when the create has not reached the server', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/photo.jpg', mimeType: 'image/jpeg', fileName: 'photo.jpg' }],
    });
    // The row is still the local dirty create (offline push): the screen must
    // not call uploadMedia with the client id, which would 404 on the server.
    mockFindExerciseByClientID.mockReturnValue({
      id: 'client-e1',
      client_id: 'client-e1',
      name: 'Dumbbell Fly',
      is_built_in: false,
      created_at: '2026-02-03T12:00:00Z',
      updated_at: '2026-02-03T12:00:00Z',
      version: 1,
      is_dirty: 1,
      operation: 'create',
      last_synced_at: null,
    });
    const instance = await renderCreate();

    await act(async () => {
      await instance.root.findByProps({ testID: 'createExercise.pickPhoto' }).props.onPress();
    });
    await changeText(instance, 'createExercise.name', 'Dumbbell Fly');
    await submit(instance);

    expect(mockUploadMedia).not.toHaveBeenCalled();
    expect(mockUpsertExercise).toHaveBeenCalled();
    expect(instance.root.findByProps({ testID: 'createExercise.error' })).toBeTruthy();
  });
});
