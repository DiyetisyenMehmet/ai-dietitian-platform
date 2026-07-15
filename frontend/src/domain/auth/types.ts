/** Application roles mirrored from the backend. */
export type UserRole = "USER" | "ADMIN";

/** Authenticated user profile as returned by the backend `/auth` endpoints. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  /** Gate flag: the app stays locked until this is true. */
  onboardingCompleted: boolean;
  createdAt: string;
}

/** Token pair issued by the backend on register/login/refresh. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

/** Successful authentication result (backend `data` payload). */
export interface AuthSession {
  user: AuthUser;
  tokens: AuthTokens;
}
