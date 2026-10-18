import jwt, { type JwtPayload } from "jsonwebtoken";

import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";

interface FirebaseProviderInfo {
  providerId?: string;
  rawId?: string;
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
  // Optional only for compatibility with old test adapters; safe linking requires them.
  signInProvider?: string;
  phoneAuthenticationVerified?: boolean;
  googleSubject?: string | null;
  authTime?: number;
}

export const firebaseAuthProvider = {
  async verifyIdToken(idToken: string): Promise<VerifiedExternalIdentity> {
    if (!env.FIREBASE_WEB_API_KEY.trim()) {
      throw new ApiError(503, "External sign-in is not configured.", {
        code: "EXTERNAL_AUTH_UNAVAILABLE",
      });
    }

    let response: Response;
    try {
      response = await fetch(
        `${env.FIREBASE_AUTH_API_BASE_URL}/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken }),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw ApiError.unauthorized("External identity could not be verified.");
    }

    if (!response.ok) {
      throw ApiError.unauthorized("External identity could not be verified.");
    }

    let payload: FirebaseLookupResponse;
    try {
      payload = (await response.json()) as FirebaseLookupResponse;
    } catch {
      throw ApiError.unauthorized("External identity could not be verified.");
    }
    const user = payload.users?.[0];
    if (!user?.localId || user.disabled) {
      throw ApiError.unauthorized("External identity is invalid or disabled.");
    }

    // Online accounts:lookup verified THIS exact token before decoding. A linked
    // Google provider in user metadata is not proof of Google authentication.
    let decoded: string | JwtPayload | null;
    try {
      decoded = jwt.decode(idToken);
    } catch {
      throw ApiError.unauthorized("External identity could not be verified.");
    }
    const claims = decoded as
      | (JwtPayload & {
          auth_time?: number;
          phone_number?: string;
          firebase?: { sign_in_provider?: string; identities?: Record<string, string[]> };
        })
      | null;
    if (claims?.sub !== user.localId)
      throw ApiError.unauthorized("External identity could not be verified.");
    const provider = claims.firebase?.sign_in_provider;
    const google = user.providerUserInfo?.find((x) => x.providerId === "google.com")?.rawId;
    const tokenSubjects = claims.firebase?.identities?.["google.com"];
    if (provider === "google.com" && google && tokenSubjects && !tokenSubjects.includes(google)) {
      throw ApiError.unauthorized("External identity could not be verified.");
    }
    return {
      uid: user.localId,
      signInProvider: provider,
      googleSubject:
        provider === "google.com" &&
        google &&
        Array.isArray(tokenSubjects) &&
        tokenSubjects.includes(google)
          ? google
          : null,
      phoneAuthenticationVerified:
        provider === "phone" &&
        Boolean(user.phoneNumber) &&
        claims.phone_number === user.phoneNumber,
      authTime: claims.auth_time,
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
