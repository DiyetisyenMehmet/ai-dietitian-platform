import type { PaidTier } from "@/domain/payments/types";
import {
  paymentsClient,
  type GooglePlayConfigDto,
  type GooglePlayVerifyDto,
} from "./payments-client";

interface NativeBillingBridge {
  isAvailable(): boolean;
  appVersion(): string;
  queryProducts(productIdsJson: string): void;
  purchase(productId: string, offerToken: string, obfuscatedAccountId: string): void;
  restorePurchases(): void;
}

declare global {
  interface Window {
    DiewishBilling?: NativeBillingBridge;
    __DIEWISH_ANDROID_APP__?: boolean;
  }
}

export interface GooglePlayPricingPhase {
  formattedPrice: string;
  priceCurrencyCode: string;
  priceAmountMicros: number;
  billingPeriod: string;
  billingCycleCount: number;
  recurrenceMode: number;
}

export interface GooglePlayOffer {
  offerToken: string;
  basePlanId: string;
  offerId: string | null;
  pricingPhases: GooglePlayPricingPhase[];
}

export interface GooglePlayProduct {
  productId: string;
  title: string;
  description: string;
  offers: GooglePlayOffer[];
}

interface ProductsEventDetail {
  products?: GooglePlayProduct[];
  error?: string;
  responseCode?: number;
}

interface NativePurchase {
  purchaseToken: string;
  purchaseState: number;
  acknowledged: boolean;
  orderId: string | null;
  products: string[];
}

interface PurchaseEventDetail {
  state: "PURCHASED" | "PENDING" | "CANCELED" | "ERROR" | "RESTORED" | "RESTORE_FAILED" | string;
  purchases?: NativePurchase[];
  responseCode?: number;
}

export interface AndroidBillingCatalog {
  config: GooglePlayConfigDto;
  products: GooglePlayProduct[];
}

export type AndroidPurchaseOutcome =
  | { state: "ACTIVE"; verification: GooglePlayVerifyDto }
  | { state: "PENDING" }
  | { state: "CANCELED" };

export class AndroidBillingError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AndroidBillingError";
  }
}

function bridge(): NativeBillingBridge | null {
  if (typeof window === "undefined") return null;
  return window.DiewishBilling ?? null;
}

export function isAndroidApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.DiewishBilling || window.__DIEWISH_ANDROID_APP__);
}

export function isAndroidBillingAvailable(): boolean {
  const native = bridge();
  if (!native) return false;
  try {
    return native.isAvailable();
  } catch {
    return false;
  }
}

function waitForCustomEvent<T>(
  name: string,
  trigger: () => void,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener(name, listener as EventListener);
      reject(new AndroidBillingError("Google Play yanıt vermedi.", "TIMEOUT"));
    }, timeoutMs);

    const listener = (event: Event) => {
      window.clearTimeout(timeout);
      window.removeEventListener(name, listener as EventListener);
      resolve((event as CustomEvent<T>).detail);
    };

    window.addEventListener(name, listener as EventListener, { once: true });
    try {
      trigger();
    } catch (error) {
      window.clearTimeout(timeout);
      window.removeEventListener(name, listener as EventListener);
      reject(error);
    }
  });
}

function preferredOffer(product: GooglePlayProduct): GooglePlayOffer | null {
  return product.offers.find((offer) => offer.offerId === null) ?? product.offers[0] ?? null;
}

export function recurringPrice(product: GooglePlayProduct | undefined): string | null {
  if (!product) return null;
  const offer = preferredOffer(product);
  const phase = offer?.pricingPhases.at(-1);
  return phase?.formattedPrice ?? null;
}

export function isServerVerificationReady(catalog: AndroidBillingCatalog | null): boolean {
  return catalog?.config.serverVerificationReady === true;
}

export async function loadAndroidBillingCatalog(): Promise<AndroidBillingCatalog> {
  const native = bridge();
  if (!native || !isAndroidBillingAvailable()) {
    throw new AndroidBillingError("Google Play faturalandırması hazır değil.", "BILLING_UNAVAILABLE");
  }

  const config = await paymentsClient.googlePlayConfig();
  if (!config.packageName || !config.premiumProductId || !config.premiumPlusProductId) {
    throw new AndroidBillingError("Google Play ürünleri henüz yapılandırılmadı.", "CONFIG_UNAVAILABLE");
  }

  const detail = await waitForCustomEvent<ProductsEventDetail>(
    "diewish:billing-products",
    () => native.queryProducts(JSON.stringify([config.premiumProductId, config.premiumPlusProductId])),
    15_000,
  );

  if (detail.error) {
    throw new AndroidBillingError("Google Play ürün bilgileri alınamadı.", detail.error);
  }

  return { config, products: detail.products ?? [] };
}

function productIdForTier(catalog: AndroidBillingCatalog, tier: PaidTier): string {
  return tier === "PREMIUM"
    ? catalog.config.premiumProductId
    : catalog.config.premiumPlusProductId;
}

export async function purchaseAndroidTier(
  tier: PaidTier,
  catalog: AndroidBillingCatalog,
): Promise<AndroidPurchaseOutcome> {
  const native = bridge();
  if (!native || !isAndroidBillingAvailable()) {
    throw new AndroidBillingError("Google Play faturalandırması hazır değil.", "BILLING_UNAVAILABLE");
  }
  if (!catalog.config.serverVerificationReady) {
    throw new AndroidBillingError(
      "Google Play sunucu doğrulaması henüz hazır değil.",
      "SERVER_VERIFICATION_UNAVAILABLE",
    );
  }

  const productId = productIdForTier(catalog, tier);
  const product = catalog.products.find((item) => item.productId === productId);
  const offer = product ? preferredOffer(product) : null;
  if (!product || !offer) {
    throw new AndroidBillingError("Seçilen Google Play ürünü kullanılamıyor.", "PRODUCT_UNAVAILABLE");
  }

  const detail = await waitForCustomEvent<PurchaseEventDetail>(
    "diewish:billing-purchase",
    () => native.purchase(product.productId, offer.offerToken, catalog.config.obfuscatedAccountId),
    120_000,
  );

  if (detail.state === "CANCELED") return { state: "CANCELED" };
  if (detail.state === "PENDING") return { state: "PENDING" };
  if (detail.state !== "PURCHASED") {
    throw new AndroidBillingError("Google Play satın alma işlemi tamamlanamadı.", detail.state || "PURCHASE_FAILED");
  }

  const purchase = detail.purchases?.find((item) => item.products.includes(productId));
  if (!purchase?.purchaseToken) {
    throw new AndroidBillingError("Google Play satın alma doğrulama bilgisi eksik.", "PURCHASE_TOKEN_MISSING");
  }

  const verification = await paymentsClient.verifyGooglePlaySubscription(purchase.purchaseToken);
  return { state: "ACTIVE", verification };
}

export async function restoreAndroidPurchases(): Promise<GooglePlayVerifyDto[]> {
  const native = bridge();
  if (!native || !isAndroidBillingAvailable()) {
    throw new AndroidBillingError("Google Play faturalandırması hazır değil.", "BILLING_UNAVAILABLE");
  }

  const config = await paymentsClient.googlePlayConfig();
  if (!config.serverVerificationReady) {
    throw new AndroidBillingError(
      "Google Play sunucu doğrulaması henüz hazır değil.",
      "SERVER_VERIFICATION_UNAVAILABLE",
    );
  }

  const detail = await waitForCustomEvent<PurchaseEventDetail>(
    "diewish:billing-purchase",
    () => native.restorePurchases(),
    30_000,
  );
  if (detail.state !== "RESTORED") {
    throw new AndroidBillingError("Google Play satın alımları geri yüklenemedi.", detail.state || "RESTORE_FAILED");
  }

  const verified: GooglePlayVerifyDto[] = [];
  const seen = new Set<string>();
  for (const purchase of detail.purchases ?? []) {
    if (purchase.purchaseState !== 1 || !purchase.purchaseToken || seen.has(purchase.purchaseToken)) continue;
    seen.add(purchase.purchaseToken);
    verified.push(await paymentsClient.verifyGooglePlaySubscription(purchase.purchaseToken));
  }
  return verified;
}
