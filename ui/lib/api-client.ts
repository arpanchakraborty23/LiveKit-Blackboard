const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:8000';

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  params?: Record<string, string | number | boolean | undefined>;
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { timeoutMs = 8000, params, ...fetchOptions } = options;

  let urlStr = path.startsWith('http')
    ? path
    : `${BACKEND_URL}${path.startsWith('/') ? path : `/${path}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        searchParams.set(key, String(val));
      }
    }
    const query = searchParams.toString();
    if (query) {
      urlStr += (urlStr.includes('?') ? '&' : '?') + query;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(urlStr, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...fetchOptions.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errData: unknown = null;
      let errMsg = `API error ${response.status}: ${response.statusText}`;
      try {
        errData = await response.json();
        const record = errData as Record<string, unknown>;
        if (record?.detail) {
          errMsg = typeof record.detail === 'string' ? record.detail : JSON.stringify(record.detail);
        } else if (record?.error) {
          errMsg = typeof record.error === 'string' ? record.error : JSON.stringify(record.error);
        } else if (record?.message) {
          errMsg = String(record.message);
        }
      } catch {
        // Non-JSON error body
      }
      throw new ApiError(response.status, errMsg, errData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(408, `Request timed out after ${timeoutMs}ms`);
    }
    throw new ApiError(
      500,
      err instanceof Error ? err.message : 'Network request failed',
      err
    );
  }
}

export const api = {
  get: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body:
        body !== undefined
          ? typeof body === 'string'
            ? body
            : JSON.stringify(body)
          : undefined,
    }),

  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PUT',
      body:
        body !== undefined
          ? typeof body === 'string'
            ? body
            : JSON.stringify(body)
          : undefined,
    }),

  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body:
        body !== undefined
          ? typeof body === 'string'
            ? body
            : JSON.stringify(body)
          : undefined,
    }),

  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export default api;
