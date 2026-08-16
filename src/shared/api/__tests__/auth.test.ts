import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { authApi } from '../auth';
import { AUTH_BASE } from '../client';

const mockFetch = jest.fn<typeof fetch>();
globalThis.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('authApi', () => {
  it('registers against the auth service without an auth header', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ access_token: 'a', refresh_token: 'r', expires_in: 900 }, 201),
    );

    await authApi.register({ email: 'a@b.c', password: 'password123', display_name: 'A' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${AUTH_BASE}/v1/auth/register`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'a@b.c',
      password: 'password123',
      display_name: 'A',
    });
  });

  it('logs in and returns the token pair', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ access_token: 'a', refresh_token: 'r', expires_in: 900 }),
    );

    const pair = await authApi.login({ email: 'a@b.c', password: 'password123' });

    expect(pair).toEqual({ access_token: 'a', refresh_token: 'r', expires_in: 900 });
    expect(mockFetch.mock.calls[0][0]).toBe(`${AUTH_BASE}/v1/auth/login`);
  });

  it('posts the refresh token on refresh', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ access_token: 'a2', refresh_token: 'r2', expires_in: 900 }),
    );

    await authApi.refresh('r');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${AUTH_BASE}/v1/auth/refresh`);
    expect(JSON.parse(init?.body as string)).toEqual({ refresh_token: 'r' });
  });

  it('resolves undefined on logout 204', async () => {
    mockFetch.mockImplementation(async () => new Response(null, { status: 204 }));

    await expect(authApi.logout('r')).resolves.toBeUndefined();
    expect(mockFetch.mock.calls[0][0]).toBe(`${AUTH_BASE}/v1/auth/logout`);
  });

  it('fetches and updates the user profile', async () => {
    mockFetch.mockImplementation(async () =>
      jsonResponse({
        id: 'user-1',
        display_name: 'A',
        gender: 'male',
        email: 'a@b.c',
        created_at: '2026-01-01T00:00:00Z',
      }),
    );

    await authApi.getProfile('user-1');
    expect(mockFetch.mock.calls[0][0]).toBe(`${AUTH_BASE}/v1/users/user-1`);

    await authApi.updateProfile('user-1', { display_name: 'B', gender: 'other' });

    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe(`${AUTH_BASE}/v1/users/user-1`);
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ display_name: 'B', gender: 'other' });
  });
});
