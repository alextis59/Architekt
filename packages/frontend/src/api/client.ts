import { getAuthToken, notifyUnauthorized } from '../auth/tokenStore.js';

const DEFAULT_HEADERS: HeadersInit = {
  'Content-Type': 'application/json'
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000';

const isJsonResponse = (response: Response) => {
  const contentType = response.headers.get('content-type');
  return contentType ? contentType.includes('application/json') : false;
};

export type ApiError = Error & {
  status?: number;
  payload?: unknown;
};

export const apiRequest = async <TResponse>(
  path: string,
  options: RequestInit = {}
): Promise<TResponse> => {
  const authToken = getAuthToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers ?? {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });

  if (!response.ok) {
    let payload: unknown = null;
    if (isJsonResponse(response)) {
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
    }

    const error: ApiError = new Error('Request failed');
    error.status = response.status;
    error.payload = payload;
    if (response.status === 401) {
      notifyUnauthorized();
    }

    throw error;
  }

  if (!isJsonResponse(response)) {
    return null as TResponse;
  }

  return (await response.json()) as TResponse;
};

export type PaginatedResponse<TItem> = {
  items: TItem[];
};

