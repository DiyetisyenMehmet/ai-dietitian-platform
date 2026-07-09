/** Authenticated user profile as returned by the backend. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

/** Successful authentication result. */
export interface AuthSession {
  user: AuthUser;
  /** Opaque access token issued by the backend. */
  accessToken: string;
}
