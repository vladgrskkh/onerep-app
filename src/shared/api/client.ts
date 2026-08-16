export interface ValidationDetail {
  field?: string;
  tag?: string;
  param?: string;
}

export interface ErrorBody {
  code: string;
  message: string;
  user_message?: string;
  details?: ValidationDetail[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly userMessage?: string;
  readonly details?: ValidationDetail[];

  constructor(
    status: number,
    code: string,
    message: string,
    userMessage?: string,
    details?: ValidationDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.userMessage = userMessage;
    this.details = details;
  }
}

export type TokenProvider = () => Promise<string | null> | string | null;
export type RefreshCallback = () => Promise<void>;

export const AUTH_BASE = process.env.EXPO_PUBLIC_AUTH_URL ?? 'http://localhost:8080';
export const GYM_BASE = process.env.EXPO_PUBLIC_GYM_URL ?? 'http://localhost:8081';

export const DEFAULT_TIMEOUT_MS = 10_000;

let tokenProvider: TokenProvider | null = null;
let refreshCallback: RefreshCallback | null = null;
let refreshInFlight: Promise<void> | null = null;

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export function setRefreshCallback(callback: RefreshCallback | null): void {
  refreshCallback = callback;
}

function refreshOnce(): Promise<void> {
  if (!refreshCallback) {
    return Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'No refresh callback registered'));
  }
  if (!refreshInFlight) {
    refreshInFlight = Promise.resolve(refreshCallback()).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export function omitZeroValues<T extends object>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '' || value === 0 || value === false) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    result[key] = value;
  }
  return result as T;
}

export type QueryValue = string | number | boolean | Date | undefined | null;

export function toQuery(params?: object): string {
  if (!params) {
    return '';
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) {
      continue;
    }
    const serialized = value instanceof Date ? value.toISOString() : String(value);
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(serialized)}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export type UploadFile = { uri: string; name?: string; type?: string } | Blob | ArrayBuffer | string;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  auth?: boolean;
  json?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

interface InternalRequestOptions extends RequestOptions {
  isRetry?: boolean;
}

async function parseErrorBody(res: Response): Promise<ErrorBody | null> {
  try {
    const body = (await res.json()) as Partial<{ error: ErrorBody }>;
    if (body?.error && typeof body.error.code === 'string' && typeof body.error.message === 'string') {
      return body.error;
    }
    return null;
  } catch {
    return null;
  }
}

export async function request<T>(
  url: string,
  opts: RequestOptions = {},
  internal: InternalRequestOptions = {},
): Promise<T> {
  const { method = 'GET', auth = true, json, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const isRetry = internal.isRetry === true;

  const headers: Record<string, string> = {};
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth && tokenProvider) {
    const token = await tokenProvider();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  Object.assign(headers, opts.headers);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(omitZeroValues(json as object)) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(0, 'TIMEOUT', `Request timed out after ${timeoutMs}ms`);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && auth && !isRetry) {
    try {
      await refreshOnce();
    } catch {
      const body = await parseErrorBody(res);
      throw toApiError(res, body);
    }
    return request<T>(url, opts, { ...internal, isRetry: true });
  }

  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw toApiError(res, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function toApiError(res: Response, body: ErrorBody | null): ApiError {
  if (body) {
    return new ApiError(res.status, body.code, body.message, body.user_message, body.details);
  }
  return new ApiError(res.status, `HTTP_${res.status}`, `Request failed with status ${res.status}`);
}

export interface ApiClient {
  get<T>(path: string, opts?: RequestOptions): Promise<T>;
  post<T>(path: string, opts?: RequestOptions): Promise<T>;
  patch<T>(path: string, opts?: RequestOptions): Promise<T>;
  put<T>(path: string, opts?: RequestOptions): Promise<T>;
  delete<T = void>(path: string, opts?: RequestOptions): Promise<T>;
}

export function createClient(baseUrl: string): ApiClient {
  return {
    get: <T>(path: string, opts?: RequestOptions) => request<T>(`${baseUrl}${path}`, { ...opts, method: 'GET' }),
    post: <T>(path: string, opts?: RequestOptions) => request<T>(`${baseUrl}${path}`, { ...opts, method: 'POST' }),
    patch: <T>(path: string, opts?: RequestOptions) => request<T>(`${baseUrl}${path}`, { ...opts, method: 'PATCH' }),
    put: <T>(path: string, opts?: RequestOptions) => request<T>(`${baseUrl}${path}`, { ...opts, method: 'PUT' }),
    delete: <T = void>(path: string, opts?: RequestOptions) =>
      request<T>(`${baseUrl}${path}`, { ...opts, method: 'DELETE' }),
  };
}
