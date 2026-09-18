import { ApiError } from "@/infrastructure/api/http-client";
import { authClient } from "@/infrastructure/auth/auth-client";
import { notificationClient } from "@/infrastructure/notifications/notification-client";
import { releaseNotificationDevice } from "@/infrastructure/notifications/notification-lifecycle";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@/domain/auth/validation";
import type { AuthSession } from "@/domain/auth/types";

export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: string };

interface NativeNotificationLifecycleBridge {
  pushToken(): string;
  deletePushToken?(): void;
  clearPendingNotificationPath?(): void;
}

function nativeNotificationBridge(): NativeNotificationLifecycleBridge | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = (
      window as typeof window & { DiewishReminders?: Partial<NativeNotificationLifecycleBridge> }
    ).DiewishReminders;
    if (!value || typeof value.pushToken !== "function") return undefined;
    return value as NativeNotificationLifecycleBridge;
  } catch {
    return undefined;
  }
}

function toFriendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 401) return "E-posta veya şifre hatalı.";
    if (error.status === 409) return "Bu e-posta adresi zaten kayıtlı.";
    if (error.status === 422) return "Girilen bilgiler geçersiz. Lütfen kontrol edin.";
    if (error.status === 429) {
      if (error.code === "AUTH_LOGIN_RATE_LIMITED") {
        return "Çok sayıda başarısız giriş denemesi yapıldı. Lütfen kısa süre sonra tekrar deneyin.";
      }
      if (error.code === "AUTH_REGISTER_RATE_LIMITED") {
        return "Kısa sürede çok fazla kayıt denemesi yapıldı. Lütfen biraz sonra tekrar deneyin.";
      }
      if (error.code === "AUTH_REFRESH_RATE_LIMITED") {
        return "Oturum yenileme geçici olarak sınırlandı. Lütfen kısa süre sonra tekrar deneyin.";
      }
      return "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin.";
    }
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

  /**
   * Best-effort cookie-session logout. The current Android push binding is
   * disabled while the access token is still valid, then the native FCM token
   * is deleted so a later account receives a newly registered token.
   */
  async logout(_legacyRefreshToken?: string | null): Promise<void> {
    const native = nativeNotificationBridge();
    let token = "";
    try {
      token = native?.pushToken().trim() ?? "";
    } catch {
      token = "";
    }

    await releaseNotificationDevice(
      token,
      (currentToken) => notificationClient.unregisterDevice(currentToken),
      () => {
        native?.clearPendingNotificationPath?.();
        native?.deletePushToken?.();
      },
    );

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
