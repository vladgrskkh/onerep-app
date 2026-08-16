import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { act, create } from 'react-test-renderer';

import { ApiError } from '../../../shared/api/client';

type Profile = {
  id: string;
  display_name: string;
  email?: string;
  gender?: string;
  birth_date?: string;
  created_at: string;
};

let mockUser: Profile = {
  id: 'user-1',
  display_name: 'Ann Lee',
  email: 'ann@example.com',
  gender: 'female',
  birth_date: '1995-07-14',
  created_at: '2026-01-01T00:00:00Z',
};

type UpdateFn = (data: { display_name?: string; gender?: string; birth_date?: string }) => Promise<void>;
const mockUpdateProfile = jest.fn<UpdateFn>();
const mockLogout = jest.fn<() => Promise<void>>();

jest.mock('../AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    login: jest.fn(),
    logout: mockLogout,
    register: jest.fn(),
    refresh: jest.fn(),
    updateProfile: mockUpdateProfile,
  }),
  getUserMessage: (error: unknown, fallback: string) => {
    const candidate = error as { userMessage?: string; message?: string };
    return candidate.userMessage ?? candidate.message ?? fallback;
  },
}));

// eslint-disable-next-line import/first
import { ProfileScreen } from '../ProfileScreen';

async function renderProfile() {
  let instance: ReturnType<typeof create>;
  await act(async () => {
    instance = create(<ProfileScreen />);
  });
  return instance!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = {
    id: 'user-1',
    display_name: 'Ann Lee',
    email: 'ann@example.com',
    gender: 'female',
    birth_date: '1995-07-14',
    created_at: '2026-01-01T00:00:00Z',
  };
});

describe('ProfileScreen', () => {
  it('renders avatar initials, email and settings rows from the auth user', async () => {
    const instance = await renderProfile();

    expect(instance.root.findByProps({ testID: 'profile.avatar' })).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'profile.email' }).props.children).toBe(
      'ann@example.com',
    );
    expect(
      instance.root.findByProps({ testID: 'profile.row.displayName' }).findByProps({
        children: 'Ann Lee',
      }),
    ).toBeTruthy();
    expect(
      instance.root.findByProps({ testID: 'profile.row.gender' }).findByProps({
        children: 'Female',
      }),
    ).toBeTruthy();
    expect(
      instance.root.findByProps({ testID: 'profile.row.birthDate' }).findByProps({
        children: '1995-07-14',
      }),
    ).toBeTruthy();
    expect(instance.root.findByProps({ testID: 'profile.logout' })).toBeTruthy();
  });

  it('edits the display name via updateProfile', async () => {
    mockUpdateProfile.mockImplementation(async (data: { display_name?: string }) => {
      mockUser = { ...mockUser, display_name: data.display_name ?? mockUser.display_name };
    });
    const instance = await renderProfile();

    await act(async () => {
      instance.root.findByProps({ testID: 'profile.row.displayName' }).props.onPress();
    });

    await act(async () => {
      instance.root.findByProps({ testID: 'profile.edit.displayName' }).props.onChangeText('Anna');
    });
    await act(async () => {
      instance.root.findByProps({ testID: 'profile.save.displayName' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockUpdateProfile).toHaveBeenCalledWith({ display_name: 'Anna' });
  });

  it('selects a gender chip and saves it', async () => {
    mockUpdateProfile.mockImplementation(async (data: { gender?: string }) => {
      mockUser = { ...mockUser, gender: data.gender ?? mockUser.gender };
    });
    const instance = await renderProfile();

    await act(async () => {
      instance.root.findByProps({ testID: 'profile.row.gender' }).props.onPress();
    });
    await act(async () => {
      instance.root.findByProps({ testID: 'profile.gender.male' }).props.onPress();
    });
    await act(async () => {
      instance.root.findByProps({ testID: 'profile.save.gender' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockUpdateProfile).toHaveBeenCalledWith({ gender: 'male' });
  });

  it('shows the API error message when saving fails', async () => {
    mockUpdateProfile.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'bad input', 'Birth date must be a valid date'),
    );
    const instance = await renderProfile();

    await act(async () => {
      instance.root.findByProps({ testID: 'profile.row.birthDate' }).props.onPress();
    });
    await act(async () => {
      instance.root.findByProps({ testID: 'profile.edit.birthDate' }).props.onChangeText('nope');
    });
    await act(async () => {
      instance.root.findByProps({ testID: 'profile.save.birthDate' }).props.onPress();
      await Promise.resolve();
    });

    expect(instance.root.findByProps({ testID: 'profile.error' }).props.children).toBe(
      'Birth date must be a valid date',
    );
  });

  it('logs out via the destructive button', async () => {
    mockLogout.mockResolvedValue(undefined);
    const instance = await renderProfile();

    await act(async () => {
      instance.root.findByProps({ testID: 'profile.logout' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
