/** Application roles mirrored from the backend. */
export type UserRole = "USER" | "ADMIN";

/** Authenticated user profile as returned by the backend auth/identity endpoints. */
export interface AuthUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  /** Guest sessions are deliberately limited to guest-aware screens. */
  isGuest?: boolean;
  /** Gate flag: the app stays locked until this is true. */
  onboardingCompleted: boolean;
  createdAt: string;
}

/** Access-token data returned to JavaScript. Refresh tokens remain HttpOnly. */
export interface AuthTokens {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

/** Successful authentication result (backend `data` payload). */
export interface AuthSession {
  user: AuthUser;
  tokens: AuthTokens;
}
