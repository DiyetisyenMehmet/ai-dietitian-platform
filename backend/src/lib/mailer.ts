import { env, isProduction } from "../config/env";
import { logger } from "./logger";

/**
 * Transactional email delivery.
 *
 * The account-lifecycle flows (email verification, password reset) depend on
 * delivering a one-time link to the user. Integrating a production email
 * provider (SMTP / transactional API) is a dedicated later concern; this module
 * defines the delivery *contract* and ships a log-based transport so the flows
 * are end-to-end functional in development and test without external services.
 *
 * The transport is intentionally the only piece deferred — token issuance,
 * hashing, expiry and one-time-use are all fully implemented in the service
 * layer. Swapping in a real provider means replacing `deliver()` alone.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Kept simple and provider-agnostic. */
  text: string;
}

/**
 * Low-level delivery primitive. In production without a configured provider it
 * logs a warning (so a missing integration is loud rather than silent); in
 * development it logs the full message for manual testing. Returning a promise
 * keeps the surface identical to a real async provider.
 */
async function deliver(message: EmailMessage): Promise<void> {
  if (isProduction) {
    // No production provider is wired yet. Log at warn so the gap is visible in
    // aggregation, but never log the message body (it contains a live link).
    logger.warn(
      { to: message.to, subject: message.subject },
      "Email delivery requested but no production email provider is configured",
    );
    return;
  }

  logger.info(
    { to: message.to, subject: message.subject, body: message.text },
    "[dev-mailer] Email 'sent' (logged, not delivered)",
  );
}

function buildLink(path: string, token: string): string {
  const base = env.APP_WEB_URL.replace(/\/+$/, "");
  return `${base}${path}?token=${encodeURIComponent(token)}`;
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
  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = buildLink("/reset-password", token);
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
