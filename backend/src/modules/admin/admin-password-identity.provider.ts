import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";

interface IdentityErrorPayload {
  error?: { message?: string };
}

interface IdentityAuthResponse {
  idToken: string;
  email?: string;
  localId?: string;
}

interface ResetPasswordResponse {
  email?: string;
  requestType?: string;
}

function endpoint(action: string): string {
  return `${env.FIREBASE_AUTH_API_BASE_URL}/accounts:${action}?key=${encodeURIComponent(
    env.FIREBASE_WEB_API_KEY,
  )}`;
}

function identityUnavailable(): ApiError {
  return new ApiError(503, "Management Center identity service is unavailable.", {
    code: "ADMIN_IDENTITY_UNAVAILABLE",
  });
}

function identityError(code: string, operation: "signin" | "mutation"): ApiError {
  if (
    operation === "signin" &&
    [
      "EMAIL_NOT_FOUND",
      "INVALID_PASSWORD",
      "INVALID_LOGIN_CREDENTIALS",
      "USER_DISABLED",
      "INVALID_EMAIL",
    ].includes(code)
  ) {
    return new ApiError(401, "Management Center sign-in could not be verified.", {
      code: "ADMIN_AUTH_INVALID",
    });
  }
  if (code === "EMAIL_EXISTS") {
    return new ApiError(409, "This email address is already in use.", {
      code: "ADMIN_EMAIL_IN_USE",
    });
  }
  if (code === "WEAK_PASSWORD") {
    return new ApiError(422, "The password does not meet the identity provider policy.", {
      code: "ADMIN_PASSWORD_WEAK",
    });
  }
  if (
    ["INVALID_ID_TOKEN", "TOKEN_EXPIRED", "CREDENTIAL_TOO_OLD_LOGIN_AGAIN"].includes(code)
  ) {
    return new ApiError(401, "Management Center identity verification expired.", {
      code: "ADMIN_IDENTITY_REAUTH_REQUIRED",
    });
  }
  return identityUnavailable();
}

async function request<T>(
  action: string,
  body: Record<string, unknown>,
  operation: "signin" | "mutation",
  locale = false,
): Promise<T> {
  if (!env.FIREBASE_WEB_API_KEY.trim()) throw identityUnavailable();

  let response: Response;
  try {
    response = await fetch(endpoint(action), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(locale ? { "x-firebase-locale": "tr" } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw identityUnavailable();
  }

  let payload: unknown = {};
  try {
    payload = await response.json();
  } catch {
    // Keep provider failures generic; never surface upstream payloads or credentials.
  }

  if (!response.ok) {
    const code =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message.split(" : ")[0]!
        : "UNKNOWN";
    throw identityError(code, operation);
  }

  return payload as T;
}

export const adminPasswordIdentityProvider = {
  async signIn(email: string, password: string): Promise<IdentityAuthResponse> {
    return request<IdentityAuthResponse>(
      "signInWithPassword",
      { email, password, returnSecureToken: true },
      "signin",
    );
  },

  async linkPassword(
    idToken: string,
    email: string,
    password: string,
  ): Promise<IdentityAuthResponse> {
    // With improved email privacy, accounts:signUp + idToken is the supported
    // linking path for adding email/password to an already authenticated user.
    return request<IdentityAuthResponse>(
      "signUp",
      { idToken, email, password, returnSecureToken: true },
      "mutation",
    );
  },

  async createUser(email: string, password: string): Promise<IdentityAuthResponse> {
    return request<IdentityAuthResponse>(
      "signUp",
      { email, password, returnSecureToken: true },
      "mutation",
    );
  },

  async deleteUser(idToken: string): Promise<void> {
    await request<Record<string, never>>(
      "delete",
      { idToken },
      "mutation",
    );
  },

  async sendPasswordReset(email: string): Promise<void> {
    await request<{ email?: string }>(
      "sendOobCode",
      { requestType: "PASSWORD_RESET", email },
      "mutation",
      true,
    );
  },

  async confirmPasswordReset(
    oobCode: string,
    newPassword: string,
  ): Promise<ResetPasswordResponse> {
    return request<ResetPasswordResponse>(
      "resetPassword",
      { oobCode, newPassword },
      "mutation",
    );
  },

  async updatePassword(idToken: string, password: string): Promise<IdentityAuthResponse> {
    return request<IdentityAuthResponse>(
      "update",
      { idToken, password, returnSecureToken: true },
      "mutation",
    );
  },

  async updateEmail(idToken: string, email: string): Promise<IdentityAuthResponse> {
    return request<IdentityAuthResponse>(
      "update",
      { idToken, email, returnSecureToken: true },
      "mutation",
    );
  },
};
