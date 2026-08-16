import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import { ApiError } from '../../../shared/api/client';

type LoginFn = (email: string, password: string) => Promise<void>;
const mockLogin = jest.fn<LoginFn>();

jest.mock('../AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    login: mockLogin,
    logout: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    updateProfile: jest.fn(),
  }),
  getUserMessage: (error: unknown, fallback: string) => {
    const candidate = error as { userMessage?: string; message?: string };
    return candidate.userMessage ?? candidate.message ?? fallback;
  },
}));

// eslint-disable-next-line import/first
import { LoginScreen } from '../LoginScreen';

async function renderLogin() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<LoginScreen />);
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
    instance.root.findByProps({ testID: 'login.submit' }).props.onPress();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LoginScreen', () => {
  it('renders the email and password fields and the submit button', async () => {
    const instance = await renderLogin();

    expect(instance.root.findByProps({ testID: 'login.email' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'login.password' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'login.submit' })).toBeTruthy();
  });

  it('submits the credentials to the auth context', async () => {
    mockLogin.mockResolvedValue(undefined);
    const instance = await renderLogin();

    await input(instance, 'login.email', 'a@b.c');
    await input(instance, 'login.password', 'secret');
    await submit(instance);

    expect(mockLogin).toHaveBeenCalledWith('a@b.c', 'secret');
  });

  it('shows validation errors and does not submit with an invalid email', async () => {
    const instance = await renderLogin();

    await input(instance, 'login.email', 'not-an-email');
    await input(instance, 'login.password', 'secret');
    await submit(instance);

    expect(mockLogin).not.toHaveBeenCalled();
    const emailInput = instance.root.findByProps({ testID: 'login.email' });
    expect(emailInput.props.error).toBe('Enter a valid email address');
  });

  it('does not submit without a password', async () => {
    const instance = await renderLogin();

    await input(instance, 'login.email', 'a@b.c');
    await submit(instance);

    expect(mockLogin).not.toHaveBeenCalled();
    expect(instance.root.findByProps({ testID: 'login.password' }).props.error).toBe(
      'Password is required',
    );
  });

  it('surfaces the API user message on failure', async () => {
    mockLogin.mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'bad creds', 'Email or password is incorrect'),
    );
    const instance = await renderLogin();

    await input(instance, 'login.email', 'a@b.c');
    await input(instance, 'login.password', 'wrong');
    await submit(instance);

    expect(instance.root.findByProps({ testID: 'login.error' }).props.children).toBe(
      'Email or password is incorrect',
    );
  });

  it('navigates to the register screen via the prop callback', async () => {
    const onNavigateToRegister = jest.fn();
    let instance: ReturnType<typeof create>;
    await act(async () => {
      instance = create(<LoginScreen onNavigateToRegister={onNavigateToRegister} />);
    });

    await act(async () => {
      instance!.root.findByProps({ testID: 'login.goToRegister' }).props.onPress();
    });

    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);
  });
});
