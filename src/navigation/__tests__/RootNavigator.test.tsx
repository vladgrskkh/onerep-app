import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { NavigationContainer } from '@react-navigation/native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

import type { UserProfile } from '../../shared/api/auth';

let mockUser: UserProfile | null = null;
let mockLoading = false;

jest.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: mockLoading }),
  getUserMessage: (error: unknown, fallback: string) => {
    const candidate = error as { userMessage?: string; message?: string };
    return candidate.userMessage ?? candidate.message ?? fallback;
  },
}));

jest.mock('../../shared/db/database', () => ({
  getLocalDb: jest.fn(() => ({
    getWorkouts: () => [],
    getExercises: () => [],
    getTemplates: () => [],
    getBodyWeights: () => [],
    getWorkout: () => null,
    findWorkoutByClientID: () => null,
    getTemplate: () => null,
    getProgressCache: () => null,
    setProgressCache: jest.fn(),
    upsertRemote: jest.fn(),
    upsertBodyWeight: jest.fn(),
  })),
}));

jest.mock('../../shared/sync/useSync', () => ({
  useSync: () => ({ sync: jest.fn(async () => null), isSyncing: false, lastSyncAt: null, lastError: null }),
}));

jest.mock('../../shared/api/gym', () => ({
  gymApi: {
    templates: { list: jest.fn(async () => []) },
    progress: {
      get1rm: jest.fn(async () => []),
      getVolume: jest.fn(async () => []),
      logBodyWeight: jest.fn(),
    },
  },
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// eslint-disable-next-line import/first
import { RootNavigator } from '../RootNavigator';

function renderNavigator() {
  let instance: ReturnType<typeof create>;
  act(() => {
    instance = create(
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>,
    );
  });
  lastInstance = instance!;
  return instance!;
}

let lastInstance: ReturnType<typeof create> | null = null;

function findTabButton(instance: ReturnType<typeof create>, label: string): ReactTestInstance {
  const text = instance.root.find(
    (node) => String(node.type) === 'Text' && node.props.children === label,
  );
  let current = text.parent;
  while (current && typeof current.props.onPress !== 'function') {
    current = current.parent;
  }
  if (!current) {
    throw new Error(`No tab button found for ${label}`);
  }
  return current;
}

beforeAll(() => {
  // React Navigation animates tab bar layout; fake timers keep those frames
  // from leaking past the suite into other workers in a full run.
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mockLoading = false;
  lastInstance = null;
});

afterEach(() => {
  // Unmount to stop react-navigation's scheduled renders leaking past teardown.
  const instance = lastInstance;
  if (instance) {
    act(() => {
      instance.unmount();
    });
  }
  jest.runOnlyPendingTimers();
});

describe('RootNavigator', () => {
  it('renders nothing while the auth session is loading', () => {
    mockLoading = true;
    const instance = renderNavigator();
    expect(instance.toJSON()).toBeNull();
  });

  it('shows the login screen when logged out', () => {
    const instance = renderNavigator();

    expect(instance.root.findByProps({ testID: 'login.submit' })).toBeTruthy();
  });

  it('switches to the register screen via the login callbacks', () => {
    const instance = renderNavigator();

    act(() => {
      const button = instance.root.findByProps({ testID: 'login.goToRegister' });
      button.props.onPress();
    });

    expect(instance.root.findByProps({ testID: 'register.submit' })).toBeTruthy();
  });

  it('shows the four bottom tabs when logged in', () => {
    mockUser = { id: 'u1', email: 'a@b.c', display_name: 'Ann', created_at: '2026-01-01T00:00:00Z' };
    const instance = renderNavigator();

    for (const label of ['Workout', 'Programs', 'Analytics', 'Profile']) {
      expect(findTabButton(instance, label)).toBeTruthy();
    }
    expect(instance.root.findByProps({ testID: 'workoutList.empty' })).toBeTruthy();
  });

  it('switches tabs and mounts the Programs screen', () => {
    mockUser = { id: 'u1', email: 'a@b.c', display_name: 'Ann', created_at: '2026-01-01T00:00:00Z' };
    const instance = renderNavigator();

    act(() => {
      findTabButton(instance, 'Programs').props.onPress();
    });

    expect(instance.root.findByProps({ testID: 'programs.segment.templates' })).toBeTruthy();
  });
});
