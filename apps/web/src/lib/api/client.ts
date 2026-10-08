import type { ApiErrorBody, ApiErrorCode } from '@cv-builder/contracts';

/** A failed request, in the terms the screens branch on. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The API's stable code, or `network_error` when no answer arrived. */
    readonly code: ApiErrorCode | 'network_error',
    /** One message, or one per invalid field. Plain text, to be shown as text. */
    readonly messages: string[],
  ) {
    super(messages.join(' '));
    this.name = 'ApiError';
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' && value !== null && 'code' in value && 'message' in value;

/**
 * Calls the API on this origin. The session travels in an httpOnly cookie that
 * the browser attaches by itself; this code never sees it.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, 'network_error', ['Could not reach the server. Check your connection.']);
  }
  const text = await response.text();
  let body: unknown;
  try {
    body = text === '' ? undefined : JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    if (isErrorBody(body)) {
      throw new ApiError(response.status, body.code, [body.message].flat());
    }
    throw new ApiError(response.status, 'internal_error', ['Something went wrong. Try again.']);
  }
  return body as T;
}

export const sendJson = <T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> =>
  request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
