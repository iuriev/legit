import type { Request } from 'express';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** What the session token carries. */
export interface SessionPayload {
  /** User id. */
  sub: string;
}

/** The authenticated user of a request, as established by the session guard. */
export interface SessionUser {
  id: string;
}

export type RequestWithSession = Request & { user?: SessionUser };
