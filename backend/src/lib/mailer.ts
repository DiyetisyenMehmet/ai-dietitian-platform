import nodemailer from "nodemailer";
import { env, isProduction } from "../config/env";
import { ApiError } from "../utils/api-error";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

function unavailable(): ApiError {
  return new ApiError(
    503,
    "E-posta ile kurtarma şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
    { code: "EMAIL_DELIVERY_UNAVAILABLE" },
  );
}

export function assertEmailDeliveryConfigured(): void {
  if (
    !env.SMTP_HOST ||
    !env.SMTP_USER ||
    !env.SMTP_PASSWORD ||
    !env.SMTP_FROM ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.SMTP_FROM) ||
    (isProduction && new URL(env.APP_WEB_URL).protocol !== "https:")
  )
    throw unavailable();
}

/** Existing mailer contract, now real encrypted SMTP; never log provider errors or bodies. */
export async function deliver(message: EmailMessage): Promise<void> {
  assertEmailDeliveryConfigured();
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: true,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    logger: false,
    debug: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail({ from: env.SMTP_FROM, ...message });
    if (result.accepted.length !== 1 || result.rejected.length > 0) throw unavailable();
  } catch {
    throw unavailable();
  } finally {
    transport.close();
  }
}

function buildLink(path: string, token: string): string {
  const base = env.APP_WEB_URL.replace(/\/+$/, "");
  return `${base}${path}${path === "/reset-password" ? "#" : "?"}token=${encodeURIComponent(token)}`;
}

export const mailer = {
  /** Sends an email-verification link carrying a single-use token. */
  async sendEmailVerification(to: string, token: string): Promise<void> {
    const link = buildLink("/verify-email", token);
    await deliver({
      to,
      subject: "Diewish — E-posta adresinizi doğrulayın",
      text:
        "Diewish hesabınızın e-posta adresini doğrulamak için aşağıdaki bağlantıya tıklayın:\n\n" +
        `${link}\n\n` +
        `Bu bağlantı ${env.EMAIL_VERIFICATION_TTL_HOURS} saat boyunca geçerlidir. ` +
        "Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.",
    });
  },

  /** Sends a password-reset link carrying a single-use token. */
  async sendPasswordReset(to: string, token: string, path = "/reset-password"): Promise<void> {
    const link = buildLink(path, token);
    await deliver({
      to,
      subject: "Diewish — Şifre sıfırlama isteği",
      text:
        "Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:\n\n" +
        `${link}\n\n` +
        `Bu bağlantı ${env.PASSWORD_RESET_TTL_MINUTES} dakika boyunca geçerlidir. ` +
        "Bu isteği siz yapmadıysanız şifreniz değişmez; bu e-postayı yok sayabilirsiniz.",
    });
  },
};
