import { ApiError } from "@/infrastructure/api/http-client";
import { authClient } from "@/infrastructure/auth/auth-client";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@/domain/auth/validation";
import type { AuthSession } from "@/domain/auth/types";

export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: string };

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

  /** Best-effort cookie-session logout. Optional arg keeps older callers source-compatible. */
  async logout(_legacyRefreshToken?: string | null): Promise<void> {
    try {
      await authClient.logout();
    } catch {
      // Local in-memory state is cleared by the caller regardless.
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
