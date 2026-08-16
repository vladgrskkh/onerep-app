import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  ApiError,
  GYM_BASE,
  omitZeroValues,
  request,
  setRefreshCallback,
  setTokenProvider,
  toQuery,
} from '../client';
import { putFile } from '../gym';

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
  setTokenProvider(null);
  setRefreshCallback(null);
});

describe('error normalization', () => {
  it('maps the OneRep error contract onto ApiError', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'validation failed',
            user_message: 'Check the highlighted fields',
            details: [{ field: 'email', tag: 'required' }],
          },
        },
        400,
      ),
    );

    const error = await request('/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'validation failed',
      userMessage: 'Check the highlighted fields',
      details: [{ field: 'email', tag: 'required' }],
    });
  });

  it('falls back to HTTP status when the body is not the error contract', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ something: 'else' }, 500));

    const error = await request('/x').catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 500, code: 'HTTP_500' });
  });

  it('falls back to HTTP status when the body is not JSON', async () => {
    mockFetch.mockImplementation(async () => new Response('boom', { status: 502 }));

    const error = await request('/x').catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 502, code: 'HTTP_502' });
  });

  it('returns undefined for 204 responses', async () => {
    mockFetch.mockImplementation(async () => new Response(null, { status: 204 }));

    await expect(request<void>('/x', { method: 'POST', auth: false })).resolves.toBeUndefined();
  });
});

describe('headers and bodies', () => {
  it('attaches the bearer token from the token provider', async () => {
    setTokenProvider(() => 'access-token');
    mockFetch.mockImplementation(async () => jsonResponse({ ok: true }));

    await request('/x');

    const [, init] = mockFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });

  it('does not attach auth headers for unauthenticated requests', async () => {
    setTokenProvider(() => 'access-token');
    mockFetch.mockImplementation(async () => jsonResponse({ ok: true }));

    await request('/x', { auth: false });

    const [, init] = mockFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('omits zero values from JSON bodies', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ ok: true }));

    await request('/x', {
      method: 'POST',
      json: { weight_kg: 100, reps: 5, rpe: 0, rest_seconds: undefined, is_warmup: false },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ weight_kg: 100, reps: 5 });
  });
});

describe('401 refresh and retry', () => {
  it('refreshes once and retries with the new token', async () => {
    let token = 'expired';
    setTokenProvider(() => token);
    const refresh = jest.fn(async () => {
      token = 'fresh';
    });
    setRefreshCallback(refresh);

    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(request('/x')).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [, retryInit] = mockFetch.mock.calls[1];
    expect((retryInit?.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  });

  it('does not retry without a registered refresh callback', async () => {
    setTokenProvider(() => 'expired');
    mockFetch.mockImplementation(async () => new Response(null, { status: 401 }));

    const error = await request('/x').catch((e: unknown) => e);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ status: 401 });
  });

  it('throws the original 401 when the refresh fails', async () => {
    setTokenProvider(() => 'expired');
    setRefreshCallback(async () => {
      throw new Error('refresh token expired');
    });
    mockFetch.mockResolvedValue(
      jsonResponse({ error: { code: 'INVALID_TOKEN', message: 'invalid token' } }, 401),
    );

    const error = await request('/x').catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
  });

  it('does not refresh twice when the retry also returns 401', async () => {
    let token = 'expired';
    setTokenProvider(() => token);
    const refresh = jest.fn(async () => {
      token = 'still-bad';
    });
    setRefreshCallback(refresh);
    mockFetch.mockImplementation(async () => new Response(null, { status: 401 }));

    const error = await request('/x').catch((e: unknown) => e);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(error).toMatchObject({ status: 401 });
  });
});

describe('timeouts', () => {
  it('aborts with a TIMEOUT ApiError after the configured deadline', async () => {
    jest.useFakeTimers();
    mockFetch.mockImplementation(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );

    const pending = request('/x', { timeoutMs: 5000 });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });

    await jest.advanceTimersByTimeAsync(5000);
    await assertion;

    jest.useRealTimers();
  });
});

describe('toQuery', () => {
  it('serializes and encodes query params, skipping empties', () => {
    const query = toQuery({
      exercise_id: '9f9a3b7a-0000-0000-0000-000000000001',
      from: new Date('2026-01-01T00:00:00Z'),
      empty: '',
      skip: undefined,
      flag: false,
    });

    expect(query).toBe(
      `?exercise_id=${encodeURIComponent('9f9a3b7a-0000-0000-0000-000000000001')}` +
        `&from=${encodeURIComponent('2026-01-01T00:00:00.000Z')}`,
    );
  });

  it('returns an empty string for undefined params', () => {
    expect(toQuery()).toBe('');
    expect(toQuery({})).toBe('');
  });
});

describe('omitZeroValues', () => {
  it('drops zero-ish values and empty arrays', () => {
    expect(
      omitZeroValues({
        a: 1,
        b: 0,
        c: '',
        d: false,
        e: null,
        f: undefined,
        g: [],
        h: [1],
        i: true,
      }),
    ).toEqual({ a: 1, h: [1], i: true });
  });
});

describe('putFile', () => {
  it('PUTs the raw file to the presigned URL without an auth header', async () => {
    mockFetch.mockImplementation(async () => new Response(null, { status: 200 }));
    const file = { uri: 'file:///tmp/photo.jpg', type: 'image/jpeg', name: 'photo.jpg' };

    await putFile('https://s3.example.com/key', file, 'image/jpeg');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://s3.example.com/key');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(file);
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg');
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('throws ApiError on non-2xx upload responses', async () => {
    mockFetch.mockImplementation(async () => new Response(null, { status: 403 }));

    await expect(putFile('https://s3.example.com/key', 'data', 'text/plain')).rejects.toMatchObject({
      status: 403,
      code: 'HTTP_403',
    });
  });
});

describe('base URL defaults', () => {
  it('defaults to localhost:8081 for the gym service', () => {
    expect(GYM_BASE).toBe('http://localhost:8081');
  });
});
