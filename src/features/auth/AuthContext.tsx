import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, setRefreshCallback, setTokenProvider } from '../../shared/api/client';
import { authApi, TokenPair, UpdateProfileRequest, UserProfile } from '../../shared/api/auth';
import { decodeJwtPayload } from './jwt';

const ACCESS_TOKEN_KEY = 'onerep.access_token';
const REFRESH_TOKEN_KEY = 'onerep.refresh_token';
const USER_KEY = 'onerep.user';

export interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  updateProfile: (data: UpdateProfileRequest) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let accessToken: string | null = null;
let refreshToken: string | null = null;

async function saveTokenPair(pair: TokenPair): Promise<void> {
  accessToken = pair.access_token;
  refreshToken = pair.refresh_token;
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, pair.access_token);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, pair.refresh_token);
}

async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

async function saveUser(user: UserProfile): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export interface AuthProviderProps {
  children?: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setTokenProvider(() => accessToken);
    setRefreshCallback(async () => {
      try {
        if (!refreshToken) {
          throw new ApiError(401, 'UNAUTHORIZED', 'No refresh token stored', 'Session expired. Please sign in again.');
        }
        const pair = await authApi.refresh(refreshToken);
        await saveTokenPair(pair);
      } catch (error) {
        await clearTokens();
        if (!cancelled) {
          setUser(null);
        }
        throw error;
      }
    });

    (async () => {
      try {
        const [storedAccess, storedRefresh, storedUser] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
          SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        accessToken = storedAccess;
        refreshToken = storedRefresh;

        if (cancelled) {
          return;
        }

        if (storedUser) {
          setUser(JSON.parse(storedUser) as UserProfile);
        } else if (storedRefresh) {
          const payload = decodeJwtPayload(storedRefresh);
          if (payload?.user_id) {
            try {
              const profile = await authApi.getProfile(payload.user_id);
              await saveUser(profile);
              if (!cancelled) {
                setUser(profile);
              }
            } catch {
              await clearTokens();
            }
          }
        }
      } catch {
        accessToken = null;
        refreshToken = null;
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const pair = await authApi.register({ email, password, display_name: displayName });
    await saveTokenPair(pair);
    const payload = decodeJwtPayload(pair.access_token);
    const userId = payload?.user_id;
    if (userId) {
      const profile = await authApi.getProfile(userId);
      await saveUser(profile);
      setUser(profile);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const pair = await authApi.login({ email, password });
    await saveTokenPair(pair);
    const payload = decodeJwtPayload(pair.access_token);
    const userId = payload?.user_id;
    if (userId) {
      const profile = await authApi.getProfile(userId);
      await saveUser(profile);
      setUser(profile);
    }
  }, []);

  const logout = useCallback(async () => {
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // best effort — clear local state regardless
      }
    }
    await clearTokens();
    setUser(null);
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!refreshToken) {
      return false;
    }
    try {
      const pair = await authApi.refresh(refreshToken);
      await saveTokenPair(pair);
      return true;
    } catch {
      await clearTokens();
      setUser(null);
      return false;
    }
  }, []);

  const updateProfile = useCallback(
    async (data: UpdateProfileRequest) => {
      if (!user) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in', 'Please sign in first.');
      }
      const updated = await authApi.updateProfile(user.id, data);
      await saveUser(updated);
      setUser(updated);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, register, login, logout, refresh, updateProfile }),
    [user, loading, register, login, logout, refresh, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export function getUserMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) {
    return error.userMessage ?? error.message ?? fallback;
  }
  if (error instanceof Error) {
    return error.message ?? fallback;
  }
  return fallback;
}
