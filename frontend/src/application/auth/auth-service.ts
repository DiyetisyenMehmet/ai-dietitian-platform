import { ApiError } from "@/infrastructure/api/http-client";
import { authClient } from "@/infrastructure/auth/auth-client";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@/domain/auth/validation";
import type { AuthSession } from "@/domain/auth/types";

/** Discriminated result type so the UI never has to catch raw exceptions. */
export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Maps any thrown error to a friendly, user-facing Turkish message. */
function toFriendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 401) return "E-posta veya şifre hatalı.";
    if (error.status === 409) return "Bu e-posta adresi zaten kayıtlı.";
    if (error.status === 422) return "Girilen bilgiler geçersiz. Lütfen kontrol edin.";
    if (error.status === 429) return "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.";
    if (error.status >= 500) return "Sunucu hatası. Lütfen daha sonra tekrar deneyin.";
    return error.message;
  }
  return "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.";
}

/**
 * Application service coordinating authentication use cases.
 * Delegates validation to Zod schemas (in the forms) and transport to the
 * infrastructure auth client; owns error normalization for presentation.
 */
export const authService = {
  async login(input: LoginInput): Promise<AuthResult<AuthSession>> {
    try {
      const data = await authClient.login({ email: input.email, password: input.password });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toFriendlyError(error) };
    }
  },

  async register(input: RegisterInput): Promise<AuthResult<AuthSession>> {
    try {
      const data = await authClient.register({
        fullName: input.fullName,
        email: input.email,
        password: input.password,
      });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toFriendlyError(error) };
    }
  },

  /** Revokes the refresh token server-side. Best-effort: never throws to the UI. */
  async logout(refreshToken: string): Promise<void> {
    try {
      await authClient.logout({ refreshToken });
    } catch {
      // Ignore — local session is cleared regardless by the caller.
    }
  },

  async forgotPassword(input: ForgotPasswordInput): Promise<AuthResult<{ message: string }>> {
    try {
      const data = await authClient.forgotPassword(input);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toFriendlyError(error) };
    }
  },

  async resetPassword(
    token: string,
    input: ResetPasswordInput,
  ): Promise<AuthResult<{ message: string }>> {
    try {
      const data = await authClient.resetPassword({ token, password: input.password });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toFriendlyError(error) };
    }
  },

  async verifyEmail(token: string): Promise<AuthResult<{ message: string }>> {
    try {
      const data = await authClient.verifyEmail({ token });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toFriendlyError(error) };
    }
  },
} as const;
