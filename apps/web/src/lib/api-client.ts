import { getAccessToken } from './auth-storage';
import type { ApiErrorPayload } from '../types/api';

/*
  IMPORTANT:
  Vercel injects environment variables only if they start with VITE_
  We now force the frontend to ALWAYS talk to the backend.
*/

const PROD_API = 'https://crm-api-n7c7.onrender.com/api/v1';

// Vercel / Local support
const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.MODE === 'development'
    ? 'http://localhost:4000/api/v1'
    : PROD_API);

export class ApiError extends Error {
  statusCode: number;
  details: ApiErrorPayload | null;

  constructor(message: string, statusCode: number, details: ApiErrorPayload | null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

type RequestConfig = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: BodyInit | Record<string, unknown> | null;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  authToken?: string | null;
};

function createUrl(path: string, query?: RequestConfig['query']) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (!query) return url.toString();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) return response.json();
  if (contentType.includes('application/pdf') || contentType.includes('octet-stream')) return response.blob();

  const text = await response.text();
  return text || null;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;

  const message = (payload as ApiErrorPayload).message;

  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'string') return message;

  return fallback;
}

export async function apiRequest<T>(path: string, config: RequestConfig = {}): Promise<T> {
  const token = config.authToken === undefined ? getAccessToken() : config.authToken;

  const headers: Record<string, string> = { ...config.headers };

  let body: BodyInit | undefined;

  if (config.body instanceof FormData || typeof config.body === 'string' || config.body instanceof Blob) {
    body = config.body;
  } else if (config.body !== null && config.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(config.body);
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(createUrl(path, config.query), {
      method: config.method ?? 'GET',
      headers,
      body
    });
  } catch {
    throw new ApiError('Network error. Backend server is unreachable.', 0, null);
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    const fallbackMessage = `Request failed with status ${response.status}`;
    throw new ApiError(
      getErrorMessage(payload, fallbackMessage),
      response.status,
      (payload as ApiErrorPayload | null) ?? null
    );
  }

  return payload as T;
}

export async function apiDownload(path: string): Promise<Blob> {
  return apiRequest<Blob>(path);
}
