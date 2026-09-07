import { env, isProduction } from "../config/env";
import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Development currently uses a placeholder transport, but live verification or
 * reset links are never written to logs. Production still warns loudly until a
 * real provider is configured, without logging message bodies or tokens.
 */
async function deliver(message: EmailMessage): Promise<void> {
  if (isProduction) {
    logger.warn(
      { to: message.to, subject: message.subject },
      "Email delivery requested but no production email provider is configured",
    );
    return;
  }

  logger.info(
    { to: message.to, subject: message.subject },
    "[dev-mailer] Email delivery simulated; message body intentionally redacted",
  );
}

function buildLink(path: string, token: string): string {
  const base = env.APP_WEB_URL.replace(/\/+$/, "");
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

export const mailer = {
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
