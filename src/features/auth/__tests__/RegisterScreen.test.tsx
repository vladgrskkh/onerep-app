import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import { ApiError } from '../../../shared/api/client';

type RegisterFn = (email: string, password: string, displayName: string) => Promise<void>;
const mockRegister = jest.fn<RegisterFn>();

jest.mock('../AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    login: jest.fn(),
    logout: jest.fn(),
    register: mockRegister,
    refresh: jest.fn(),
    updateProfile: jest.fn(),
  }),
  getUserMessage: (error: unknown, fallback: string) => {
    const candidate = error as { userMessage?: string; message?: string };
    return candidate.userMessage ?? candidate.message ?? fallback;
  },
}));

// eslint-disable-next-line import/first
import { RegisterScreen } from '../RegisterScreen';

async function renderRegister() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<RegisterScreen />);
  });
  return instance!;
}

function input(instance: ReturnType<typeof create>, testID: string, value: string) {
  return act(async () => {
    instance.root.findByProps({ testID }).props.onChangeText(value);
  });
}

async function submit(instance: ReturnType<typeof create>) {
  await act(async () => {
    instance.root.findByProps({ testID: 'register.submit' }).props.onPress();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RegisterScreen', () => {
  it('renders email, password and display name fields', async () => {
    const instance = await renderRegister();

    expect(instance.root.findByProps({ testID: 'register.email' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'register.password' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'register.displayName' })).toBeTruthy();
  });

  it('registers with the entered details', async () => {
    mockRegister.mockResolvedValue(undefined);
    const instance = await renderRegister();

    await input(instance, 'register.email', 'a@b.c');
    await input(instance, 'register.password', 'password123');
    await input(instance, 'register.displayName', 'Ann');
    await submit(instance);

    expect(mockRegister).toHaveBeenCalledWith('a@b.c', 'password123', 'Ann');
  });

  it('requires a password of at least 8 characters', async () => {
    const instance = await renderRegister();

    await input(instance, 'register.email', 'a@b.c');
    await input(instance, 'register.password', 'short');
    await input(instance, 'register.displayName', 'Ann');
    await submit(instance);

    expect(mockRegister).not.toHaveBeenCalled();
    expect(instance.root.findByProps({ testID: 'register.password' }).props.error).toBe(
      'Password must be at least 8 characters',
    );
  });

  it('surfaces the API user message on failure', async () => {
    mockRegister.mockRejectedValue(
      new ApiError(409, 'EMAIL_TAKEN', 'taken', 'An account with this email already exists'),
    );
    const instance = await renderRegister();

    await input(instance, 'register.email', 'a@b.c');
    await input(instance, 'register.password', 'password123');
    await input(instance, 'register.displayName', 'Ann');
    await submit(instance);

    expect(instance.root.findByProps({ testID: 'register.error' }).props.children).toBe(
      'An account with this email already exists',
    );
  });

  it('navigates back to login via the prop callback', async () => {
    const onNavigateToLogin = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(<RegisterScreen onNavigateToLogin={onNavigateToLogin} />);
    });

    await act(async () => {
      instance!.root.findByProps({ testID: 'register.goToLogin' }).props.onPress();
    });

    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
  });
});
