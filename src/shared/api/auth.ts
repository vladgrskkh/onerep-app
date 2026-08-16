import { AUTH_BASE, createClient } from './client';

export type Gender = 'male' | 'female' | 'other';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateProfileRequest {
  display_name?: string;
  gender?: Gender;
  birth_date?: string;
  avatar_url?: string;
}

export interface UserProfile {
  id: string;
  display_name: string;
  avatar_url?: string;
  gender?: string;
  email?: string;
  birth_date?: string;
  created_at: string;
}

const client = createClient(AUTH_BASE);

export const authApi = {
  register: (req: RegisterRequest) =>
    client.post<TokenPair>('/v1/auth/register', { auth: false, json: req }),

  login: (req: LoginRequest) => client.post<TokenPair>('/v1/auth/login', { auth: false, json: req }),

  refresh: (refreshToken: string) =>
    client.post<TokenPair>('/v1/auth/refresh', { auth: false, json: { refresh_token: refreshToken } }),

  logout: (refreshToken: string) =>
    client.post<void>('/v1/auth/logout', { auth: false, json: { refresh_token: refreshToken } }),

  getProfile: (userId: string) => client.get<UserProfile>(`/v1/users/${userId}`),

  updateProfile: (userId: string, data: UpdateProfileRequest) =>
    client.patch<UserProfile>(`/v1/users/${userId}`, { json: data }),
};
