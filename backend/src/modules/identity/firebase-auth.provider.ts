import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";

interface FirebaseProviderInfo {
  providerId?: string;
}

interface FirebaseUserLookup {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  phoneNumber?: string;
  disabled?: boolean;
  providerUserInfo?: FirebaseProviderInfo[];
}

interface FirebaseLookupResponse {
  users?: FirebaseUserLookup[];
}

export interface VerifiedExternalIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  displayName: string | null;
  providers: string[];
}

export const firebaseAuthProvider = {
  async verifyIdToken(idToken: string): Promise<VerifiedExternalIdentity> {
    if (!env.FIREBASE_WEB_API_KEY.trim()) {
      throw new ApiError(503, "External sign-in is not configured.", {
        code: "EXTERNAL_AUTH_UNAVAILABLE",
      });
    }

    const response = await fetch(
      `${env.FIREBASE_AUTH_API_BASE_URL}/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      throw ApiError.unauthorized("External identity could not be verified.");
    }

    const payload = (await response.json()) as FirebaseLookupResponse;
    const user = payload.users?.[0];
    if (!user?.localId || user.disabled) {
      throw ApiError.unauthorized("External identity is invalid or disabled.");
    }

    return {
      uid: user.localId,
      email: user.email?.trim().toLowerCase() || null,
      emailVerified: user.emailVerified === true,
      phoneNumber: user.phoneNumber?.trim() || null,
      displayName: user.displayName?.trim() || null,
      providers: (user.providerUserInfo ?? [])
        .map((item) => item.providerId)
        .filter((value): value is string => Boolean(value)),
    };
  },
};
