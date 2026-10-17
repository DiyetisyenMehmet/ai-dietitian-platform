import * as existingMailer from "../../lib/mailer";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";

type SafeMailer = {
  assertEmailDeliveryConfigured?: () => void;
  deliver?: (message: { to: string; subject: string; text: string }) => Promise<void>;
};
const unavailable = () =>
  new ApiError(503, "Secure email verification is unavailable.", {
    code: "ACCOUNT_LINK_DELIVERY_UNAVAILABLE",
  });

/** Reuse #49's real encrypted transport; NEVER call the old log-only mailer. */
export const accountLinkDelivery = {
  assertConfigured(): void {
    const mailer = existingMailer as SafeMailer;
    if (
      typeof mailer.assertEmailDeliveryConfigured !== "function" ||
      typeof mailer.deliver !== "function"
    )
      throw unavailable();
    mailer.assertEmailDeliveryConfigured();
  },
  async send(to: string, operationId: string, token: string): Promise<void> {
    this.assertConfigured();
    const base = new URL(env.APP_WEB_URL);
    if (base.protocol !== "https:" && env.NODE_ENV !== "test") throw unavailable();
    // Future UI consumes the fragment and posts the token; never a URL query.
    const link = `${env.APP_WEB_URL.replace(/\/+$/, "")}/identity-link#operation=${encodeURIComponent(operationId)}&token=${encodeURIComponent(token)}`;
    try {
      await (existingMailer as SafeMailer).deliver!({
        to,
        subject: "Diewish — Hesap bağlantısını doğrulayın",
        text: `Bu bağlantı beş dakika geçerlidir. İşlemi siz başlatmadıysanız kullanmayın.\n\n${link}`,
      });
    } catch {
      throw unavailable();
    }
  },
};
