import type { User } from "@prisma/client";

export interface IdentityRequestContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface PublicIdentityUser {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  fullName: string | null;
  role: User["role"];
  isActive: boolean;
  isGuest: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface IdentitySessionResult {
  user: PublicIdentityUser;
  tokens: {
    accessToken: string;
    tokenType: "Bearer";
    expiresIn: string;
  };
  refreshToken?: string;
  refreshExpiresAt?: Date;
}
