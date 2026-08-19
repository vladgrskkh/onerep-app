import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import * as SecureStore from 'expo-secure-store';
import { act, create } from 'react-test-renderer';
import { Button, Text, View } from 'react-native';

import { ApiError } from '../../../shared/api/client';

let registeredRefreshCallback: (() => Promise<void>) | null = null;

jest.mock('../../../shared/api/client', () => {
  class MockApiError extends Error {
    userMessage?: string;
    constructor(_status: number, _code: string, message: string, userMessage?: string) {
      super(message);
      this.userMessage = userMessage;
    }
  }
  return {
    ApiError: MockApiError,
    setTokenProvider: jest.fn(),
    setRefreshCallback: jest.fn((callback: (() => Promise<void>) | null) => {
      registeredRefreshCallback = callback;
    }),
  };
});

type Mock = jest.Mock<(...args: any) => any>;

jest.mock('../../../shared/api/auth', () => ({
  authApi: {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  },
}));

const mockLocalPrivateData = {
  workouts: ['user-1-workout'],
  bodyWeights: ['user-1-weight'],
  exercises: ['user-1-exercise'],
  templates: ['user-1-template'],
  progressCache: ['user-1-progress'],
  syncState: ['user-1-cursor'],
};
const mockClearPrivateData = jest.fn(() => {
  mockLocalPrivateData.workouts = [];
  mockLocalPrivateData.bodyWeights = [];
  mockLocalPrivateData.exercises = [];
  mockLocalPrivateData.templates = [];
  mockLocalPrivateData.progressCache = [];
  mockLocalPrivateData.syncState = [];
});

jest.mock('../../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({ clearPrivateData: mockClearPrivateData })),
}));

// eslint-disable-next-line import/first
import { authApi } from '../../../shared/api/auth';
// eslint-disable-next-line import/first
import { AuthProvider, useAuth } from '../AuthContext';

const api = authApi as unknown as Record<string, Mock>;

interface TestResult {
  error?: string;
}

let lastError: TestResult = {};

function Harness() {
  const auth = useAuth();
  return (
    <View>
      <Text testID="user">{auth.user ? auth.user.display_name : 'none'}</Text>
      <Text testID="loading">{auth.loading ? 'loading' : 'ready'}</Text>
      <Button
        testID="doLogin"
        title="login"
        onPress={() => {
          auth.login('a@b.c', 'secret').catch((e: unknown) => {
            lastError = {
              error: e instanceof ApiError ? ((e.userMessage as string | undefined) ?? 'err') : String(e),
            };
          });
        }}
      />
      <Button
        testID="doRegister"
        title="register"
        onPress={() => {
          auth.register('a@b.c', 'secret', 'Ann').catch((e: unknown) => {
            lastError = {
              error: e instanceof ApiError ? ((e.userMessage as string | undefined) ?? 'err') : String(e),
            };
          });
        }}
      />
      <Button
        testID="doLogout"
        title="logout"
        onPress={() => {
          auth.logout().catch(() => {});
        }}
      />
      <Button
        testID="doRefresh"
        title="refresh"
        onPress={() => {
          auth.refresh().catch(() => {});
        }}
      />
    </View>
  );
}

function renderHarness() {
  return create(
    <AuthProvider>
      <Harness />
    </AuthProvider>,
  );
}

function press(instance: ReturnType<typeof create>, testID: string) {
  return act(async () => {
    instance.root.findByProps({ testID }).props.onPress();
    await Promise.resolve();
  });
}

async function flushAsync() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function makeJwt(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ user_id: userId, sub: userId })).toString('base64');
  return `header.${payload}.sig`;
}

const mockProfile = {
  id: 'user-1',
  display_name: 'Ann',
  email: 'a@b.c',
  gender: 'female',
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  (SecureStore as unknown as { __store: Map<string, string> }).__store.clear();
  jest.clearAllMocks();
  mockLocalPrivateData.workouts = ['user-1-workout'];
  mockLocalPrivateData.bodyWeights = ['user-1-weight'];
  mockLocalPrivateData.exercises = ['user-1-exercise'];
  mockLocalPrivateData.templates = ['user-1-template'];
  mockLocalPrivateData.progressCache = ['user-1-progress'];
  mockLocalPrivateData.syncState = ['user-1-cursor'];
  lastError = {};
  registeredRefreshCallback = null;
});

describe('AuthProvider', () => {
  it('restores the stored session on mount without a network call', async () => {
    const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
    store.set('onerep.access_token', 'access-1');
    store.set('onerep.refresh_token', makeJwt('user-1'));
    store.set('onerep.user', JSON.stringify(mockProfile));

    let instance: ReturnType<typeof create> | null = null;
    await act(async () => {
      instance = renderHarness();
      await flushAsync();
    });

    expect(instance!.root.findByProps({ testID: 'user' }).props.children).toBe('Ann');
    expect(instance!.root.findByProps({ testID: 'loading' }).props.children).toBe('ready');
    expect(api.getProfile).not.toHaveBeenCalled();
  });

  it('restores to logged-out when nothing is stored', async () => {
    let instance: ReturnType<typeof create> | null = null;
    await act(async () => {
      instance = renderHarness();
      await flushAsync();
    });

    expect(instance!.root.findByProps({ testID: 'user' }).props.children).toBe('none');
    expect(instance!.root.findByProps({ testID: 'loading' }).props.children).toBe('ready');
  });

  it('login stores tokens, fetches the profile and updates the user', async () => {
    api.login.mockResolvedValue({
      access_token: makeJwt('user-1'),
      refresh_token: makeJwt('user-1'),
      expires_in: 900,
    });
    api.getProfile.mockResolvedValue(mockProfile);

    let instance: ReturnType<typeof create> | null = null;
    await act(async () => {
      instance = renderHarness();
      await flushAsync();
    });
    await press(instance!, 'doLogin');

    expect(api.login).toHaveBeenCalledWith({ email: 'a@b.c', password: 'secret' });
    expect(api.getProfile).toHaveBeenCalledWith('user-1');
    expect(instance!.root.findByProps({ testID: 'user' }).props.children).toBe('Ann');

    const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
    expect(store.get('onerep.access_token')).toBe(makeJwt('user-1'));
    expect(store.get('onerep.refresh_token')).toBe(makeJwt('user-1'));
    expect(JSON.parse(store.get('onerep.user')!)).toMatchObject({ display_name: 'Ann' });
  });

  it('register stores tokens and profile', async () => {
    api.register.mockResolvedValue({
      access_token: makeJwt('user-2'),
      refresh_token: makeJwt('user-2'),
      expires_in: 900,
    });
    api.getProfile.mockResolvedValue({ ...mockProfile, id: 'user-2' });

    let instance: ReturnType<typeof create> | null = null;
    await act(async () => {
      instance = renderHarness();
      await flushAsync();
    });
    await press(instance!, 'doRegister');

    expect(api.register).toHaveBeenCalledWith({
      email: 'a@b.c',
      password: 'secret',
      display_name: 'Ann',
    });
    expect(instance!.root.findByProps({ testID: 'user' }).props.children).toBe('Ann');
  });

  it('login failure surfaces the ApiError user message', async () => {
    api.login.mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'bad creds', 'Email or password is incorrect'),
    );

    let instance: ReturnType<typeof create> | null = null;
    await act(async () => {
      instance = renderHarness();
      await flushAsync();
    });
    await press(instance!, 'doLogin');

    expect(lastError.error).toBe('Email or password is incorrect');
    expect(instance!.root.findByProps({ testID: 'user' }).props.children).toBe('none');
  });

  it('refresh stores the new token pair', async () => {
    const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
    store.set('onerep.access_token', 'access-old');
    store.set('onerep.refresh_token', makeJwt('user-1'));
    store.set('onerep.user', JSON.stringify(mockProfile));
    api.refresh.mockResolvedValue({
      access_token: 'access-new',
      refresh_token: 'refresh-new',
      expires_in: 900,
    });

    let instance: ReturnType<typeof create> | null = null;
    await act(async () => {
      instance = renderHarness();
      await flushAsync();
    });
    await press(instance!, 'doRefresh');

    expect(api.refresh).toHaveBeenCalledWith(makeJwt('user-1'));
    expect(store.get('onerep.access_token')).toBe('access-new');
    expect(store.get('onerep.refresh_token')).toBe('refresh-new');
  });

  it('refresh failure clears tokens and logs out', async () => {
    const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
    store.set('onerep.access_token', 'access-old');
    store.set('onerep.refresh_token', makeJwt('user-1'));
    store.set('onerep.user', JSON.stringify(mockProfile));
    api.refresh.mockRejectedValue(new ApiError(401, 'INVALID_TOKEN', 'bad'));

    let instance: ReturnType<typeof create> | null = null;
    await act(async () => {
      instance = renderHarness();
      await flushAsync();
    });
    await press(instance!, 'doRefresh');

    expect(store.get('onerep.access_token')).toBeUndefined();
    expect(store.get('onerep.refresh_token')).toBeUndefined();
    expect(store.get('onerep.user')).toBeUndefined();
    expect(instance!.root.findByProps({ testID: 'user' }).props.children).toBe('none');
  });

  it('logout revokes the refresh token and clears everything', async () => {
    const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
    store.set('onerep.access_token', 'access-1');
    store.set('onerep.refresh_token', 'refresh-1');
    store.set('onerep.user', JSON.stringify(mockProfile));
    api.logout.mockResolvedValue(undefined);

    let instance: ReturnType<typeof create> | null = null;
    await act(async () => {
      instance = renderHarness();
      await flushAsync();
    });
    await press(instance!, 'doLogout');

    expect(api.logout).toHaveBeenCalledWith('refresh-1');
    expect(store.get('onerep.access_token')).toBeUndefined();
    expect(store.get('onerep.refresh_token')).toBeUndefined();
    expect(store.get('onerep.user')).toBeUndefined();
    expect(instance!.root.findByProps({ testID: 'user' }).props.children).toBe('none');
  });

  it('purges the previous account cache before the next account can sign in', async () => {
    const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
    store.set('onerep.access_token', 'access-1');
    store.set('onerep.refresh_token', 'refresh-1');
    store.set('onerep.user', JSON.stringify(mockProfile));
    api.logout.mockResolvedValue(undefined);
    api.login.mockResolvedValue({
      access_token: makeJwt('user-2'),
      refresh_token: makeJwt('user-2'),
      expires_in: 900,
    });
    api.getProfile.mockResolvedValue({ ...mockProfile, id: 'user-2', display_name: 'Bea' });

    let instance: ReturnType<typeof create> | null = null;
    await act(async () => {
      instance = renderHarness();
      await flushAsync();
    });
    await press(instance!, 'doLogout');
    await press(instance!, 'doLogin');

    expect(mockClearPrivateData).toHaveBeenCalledTimes(1);
    expect(mockLocalPrivateData).toEqual({
      workouts: [],
      bodyWeights: [],
      exercises: [],
      templates: [],
      progressCache: [],
      syncState: [],
    });
    expect(instance!.root.findByProps({ testID: 'user' }).props.children).toBe('Bea');
  });

  it('registers a refresh callback that stores the new pair for the API client', async () => {
    const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
    store.set('onerep.access_token', 'access-old');
    store.set('onerep.refresh_token', 'refresh-1');
    store.set('onerep.user', JSON.stringify(mockProfile));
    api.refresh.mockResolvedValue({
      access_token: 'access-new',
      refresh_token: 'refresh-new',
      expires_in: 900,
    });

    await act(async () => {
      renderHarness();
      await Promise.resolve();
    });

    expect(registeredRefreshCallback).not.toBeNull();
    await act(async () => {
      await registeredRefreshCallback!();
    });

    expect(api.refresh).toHaveBeenCalledWith('refresh-1');
    expect(store.get('onerep.access_token')).toBe('access-new');
    expect(store.get('onerep.refresh_token')).toBe('refresh-new');
  });

  it('refresh callback clears tokens and user on refresh failure', async () => {
    const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
    store.set('onerep.access_token', 'access-old');
    store.set('onerep.refresh_token', 'refresh-1');
    store.set('onerep.user', JSON.stringify(mockProfile));
    api.refresh.mockRejectedValue(new ApiError(401, 'INVALID_TOKEN', 'bad'));

    let instance: ReturnType<typeof create> | null = null;
    await act(async () => {
      instance = renderHarness();
      await flushAsync();
    });

    await act(async () => {
      await registeredRefreshCallback!().catch(() => {});
    });

    expect(store.get('onerep.access_token')).toBeUndefined();
    expect(store.get('onerep.refresh_token')).toBeUndefined();
    expect(store.get('onerep.user')).toBeUndefined();
    expect(instance!.root.findByProps({ testID: 'user' }).props.children).toBe('none');
  });
});
