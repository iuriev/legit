import type { AuthResponse, AuthUser, CredentialsRequest } from '@cv-builder/contracts';

import { ApiError, request, sendJson } from './client';

export const authService = {
  /** The signed-in user, or null when there is no session. */
  async me(): Promise<AuthUser | null> {
    try {
      return (await request<AuthResponse>('/api/auth/me')).user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return null;
      }
      throw error;
    }
  },

  async signIn(credentials: CredentialsRequest): Promise<AuthUser> {
    return (await sendJson<AuthResponse>('POST', '/api/auth/login', credentials)).user;
  },

  async signUp(credentials: CredentialsRequest): Promise<AuthUser> {
    return (await sendJson<AuthResponse>('POST', '/api/auth/register', credentials)).user;
  },

  signOut(): Promise<void> {
    return request('/api/auth/logout', { method: 'POST' });
  },
};
