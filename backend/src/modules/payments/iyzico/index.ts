/**
 * Payment-provider factory (Sprint 15, D2).
 *
 * Selects the active provider from validated env. Only iyzico ships in V1; the
 * indirection means adding another processor later is a one-line change here
 * plus a new implementation of the interface — callers never change.
 */

import { env } from "../../../config/env";
import { iyzicoProvider } from "./iyzico.provider";
import type { PaymentProvider } from "./payment-provider.interface";

/** Returns the configured payment provider implementation. */
export function getPaymentProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "iyzico":
    default:
      return iyzicoProvider;
  }
}

export type { PaymentProvider } from "./payment-provider.interface";
