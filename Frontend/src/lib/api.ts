import { useAuthStore } from '../store/authStore';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

const API_BASE = (import.meta.env.VITE_API_URL as string) || '/api';

/** Reads the in-memory JWT from the auth store. */
function authHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Swaps the httpOnly refresh cookie for a new access token (on reload, or when the 15-min token expires).
 * Concurrent 401s share one refresh call.
 */
let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) return false;
      const { token, me } = (await r.json()) as { token: string; me: import('../types').MeResponse };
      useAuthStore.getState().setAuth(me, token);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    // Sends the httpOnly refresh cookie set by /auth/otp/verify.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(init.headers as Record<string, string>) },
  });
  const text = await res.text();
  const body = (text ? safeJson(text) : null) as ApiBody | null;
  if (res.status === 401 && !retried && !path.startsWith('/auth/') && (await refreshSession())) {
    return request<T>(path, init, true);
  }
  if (!res.ok) {
    // Backend errors look like { error: { code, message } }.
    const msg = body?.error?.message ?? body?.message ?? res.statusText;
    throw new ApiError(msg, res.status, body?.error?.code ?? body?.code);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type ApiBody = { message?: string; code?: string; error?: { code?: string; message?: string } } & Record<string, unknown>;

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
};

export const queries = {
  me: ['me'] as const,
};