// Cliente HTTP basado en fetch nativo. Maneja access token en memoria y refresh automatico.

const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';

let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const fn of listeners) fn(token);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onTokenChange(fn: (token: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

interface ApiSuccess<T> {
  success: true;
  data: T;
  pagination?: { total: number; page: number; limit: number; totalPages: number };
}

interface ApiFailure {
  success: false;
  error: string;
  code: string;
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Si es true, no intenta refresh automatico al recibir 401. Util para /auth/* */
  skipRefresh?: boolean;
  /** Si el body es FormData, no se serializa a JSON */
  isFormData?: boolean;
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const json = (await res.json()) as ApiSuccess<{ accessToken: string }>;
      if (!json.success) return null;
      setAccessToken(json.data.accessToken);
      return json.data.accessToken;
    } catch {
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, headers = {}, query, skipRefresh, isFormData, ...rest } = opts;

  const finalHeaders: Record<string, string> = { ...headers };
  if (!isFormData && body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    finalHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const fetchOpts: RequestInit = {
    ...rest,
    method: opts.method ?? (body !== undefined ? 'POST' : 'GET'),
    credentials: 'include',
    headers: finalHeaders,
  };
  if (body !== undefined) {
    fetchOpts.body = isFormData ? (body as BodyInit) : JSON.stringify(body);
  }

  const url = buildUrl(path, query);

  let res = await fetch(url, fetchOpts);

  if (res.status === 401 && !skipRefresh) {
    const newToken = await tryRefresh();
    if (newToken) {
      finalHeaders['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...fetchOpts, headers: finalHeaders });
    }
  }

  // Sin body
  if (res.status === 204) return undefined as T;

  let json: ApiSuccess<T> | ApiFailure;
  try {
    json = (await res.json()) as ApiSuccess<T> | ApiFailure;
  } catch {
    throw new ApiError(res.status, `HTTP ${res.status}`, 'INTERNAL_ERROR');
  }

  if (!res.ok || !json.success) {
    const fail = json as ApiFailure;
    throw new ApiError(res.status, fail.error ?? `HTTP ${res.status}`, fail.code ?? 'INTERNAL_ERROR', fail.details);
  }

  return json.data;
}

export interface PaginatedResponse<T> {
  data: T;
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

async function requestPaginated<T>(path: string, opts: RequestOptions = {}): Promise<PaginatedResponse<T>> {
  const { body, headers = {}, query, skipRefresh, isFormData, ...rest } = opts;
  const finalHeaders: Record<string, string> = { ...headers };
  if (!isFormData && body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (accessToken) finalHeaders['Authorization'] = `Bearer ${accessToken}`;

  const fetchOpts: RequestInit = { ...rest, method: 'GET', credentials: 'include', headers: finalHeaders };
  if (body !== undefined) fetchOpts.body = isFormData ? (body as BodyInit) : JSON.stringify(body);

  const url = buildUrl(path, query);
  let res = await fetch(url, fetchOpts);
  if (res.status === 401 && !skipRefresh) {
    const newToken = await tryRefresh();
    if (newToken) {
      finalHeaders['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...fetchOpts, headers: finalHeaders });
    }
  }
  const json = (await res.json()) as { success: boolean; data: T; pagination?: PaginatedResponse<T>['pagination']; error?: string; code?: string };
  if (!res.ok || !json.success) {
    throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`, json.code ?? 'INTERNAL_ERROR');
  }
  return {
    data: json.data,
    pagination: json.pagination ?? { total: 0, page: 1, limit: 20, totalPages: 1 },
  };
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  getPaginated: <T>(path: string, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    requestPaginated<T>(path, opts),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};
