export interface AuthUser {
  id: string;
  email: string;
}

/** Body of `POST /api/auth/register` and `POST /api/auth/login`. */
export interface CredentialsRequest {
  email: string;
  password: string;
}

/** Response of `POST /api/auth/register`, `POST /api/auth/login` and `GET /api/auth/me`. */
export interface AuthResponse {
  user: AuthUser;
}
