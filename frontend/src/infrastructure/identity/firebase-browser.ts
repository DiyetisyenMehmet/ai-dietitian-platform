import { apiRequest } from "@/infrastructure/api/http-client";
import { isApiConfigured } from "@/application/config/env";
import { startPhoneDiagnostic, type PhoneAuthDiagnostic } from "./phone-auth-diagnostics";

const FIREBASE_CDN_VERSION = "12.19.0";

interface FirebaseUserLike {
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

interface FirebaseUserCredentialLike {
  user: FirebaseUserLike;
}

interface FirebaseConfirmationLike {
  confirm(code: string): Promise<FirebaseUserCredentialLike>;
}

interface FirebaseProviderLike {
  addScope?(scope: string): void;
}

interface FirebaseRecaptchaLike {
  clear(): void;
}

function clearRecaptcha(verifier: FirebaseRecaptchaLike): void {
  try {
    verifier.clear();
  } catch {
    // Cleanup must never replace the Firebase error that explains why SMS
    // verification failed. A fresh verifier is created for every attempt.
  }
}

interface FirebaseAuthLike {
  setPersistence(value: "none"): Promise<void>;
  languageCode: string | null;
  signInWithPopup(provider: FirebaseProviderLike): Promise<FirebaseUserCredentialLike>;
  signInWithPhoneNumber(
    phoneNumber: string,
    verifier: FirebaseRecaptchaLike,
  ): Promise<FirebaseConfirmationLike>;
}

interface FirebaseAuthFactory {
  (): FirebaseAuthLike;
  GoogleAuthProvider: new () => FirebaseProviderLike;
  OAuthProvider: new (providerId: string) => FirebaseProviderLike;
  RecaptchaVerifier: new (
    container: string | HTMLElement,
    parameters?: { size?: "invisible" | "normal"; badge?: "inline"; callback?: () => void },
  ) => FirebaseRecaptchaLike;
}

interface FirebaseNamespaceLike {
  apps: unknown[];
  initializeApp(config: Record<string, string>): unknown;
  auth: FirebaseAuthFactory;
}

interface PublicFirebaseConfigResponse {
  configured: boolean;
  config: Record<string, string> | null;
}

declare global {
  interface Window {
    firebase?: FirebaseNamespaceLike;
  }
}

let loadPromise: Promise<FirebaseNamespaceLike> | null = null;
let runtimeConfigPromise: Promise<Record<string, string> | null> | null = null;

function buildTimeConfig(): Record<string, string> | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

async function config(): Promise<Record<string, string> | null> {
  // A configured backend owns identity settings; stale compiled values must
  // never silently select another Firebase project, even on a network failure.
  if (!isApiConfigured()) return buildTimeConfig();

  if (!runtimeConfigPromise) {
    runtimeConfigPromise = apiRequest<PublicFirebaseConfigResponse>({
      path: "/identity/firebase-config",
      method: "GET",
      cache: "no-store",
      retryOnUnauthorized: false,
    })
      .then((result) => {
        const value = result?.configured ? result.config : null;
        if (!value || !["apiKey", "authDomain", "projectId", "appId"].every((key) => value[key]?.trim())) {
          throw Object.assign(new Error("Identity configuration unavailable"), {
            code: "auth/configuration-unavailable",
          });
        }
        return value;
      })
      .catch((error: unknown) => {
        runtimeConfigPromise = null;
        throw error;
      });
  }
  return runtimeConfigPromise;
}

function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(Object.assign(new Error("Identity script unavailable"), { code: "auth/network-request-failed" }));
    };
    if (!existing) document.head.appendChild(script);
  });
}

async function firebase(): Promise<FirebaseNamespaceLike> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const firebaseConfig = await config();
    if (!firebaseConfig) {
      throw new Error("Google ve telefon doğrulaması için staging kimlik sağlayıcısı henüz yapılandırılmadı.");
    }
    await loadScript(
      "diewish-firebase-app",
      `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-app-compat.js`,
    );
    await loadScript(
      "diewish-firebase-auth",
      `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-auth-compat.js`,
    );
    const namespace = window.firebase;
    if (!namespace) throw new Error("Kimlik doğrulama servisi başlatılamadı.");
    if (namespace.apps.length === 0) namespace.initializeApp(firebaseConfig);
    return namespace;
  })();
  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
}

async function tokenFromCredential(credential: FirebaseUserCredentialLike): Promise<string> {
  return credential.user.getIdToken(true);
}

export async function signInWithGoogle(): Promise<string> {
  const sdk = await firebase();
  const provider = new sdk.auth.GoogleAuthProvider();
  return tokenFromCredential(await sdk.auth().signInWithPopup(provider));
}

export async function signInWithApple(): Promise<string> {
  const sdk = await firebase();
  const provider = new sdk.auth.OAuthProvider("apple.com");
  provider.addScope?.("email");
  provider.addScope?.("name");
  return tokenFromCredential(await sdk.auth().signInWithPopup(provider));
}

function phoneVerificationCancelled(): Error & { code: string } {
  return Object.assign(new Error("Phone verification view closed"), {
    code: "auth/phone-verification-cancelled",
  });
}

/** Stop awaiting work when its view closes; Firebase owns any already-sent SMS request. */
function whilePhoneViewActive<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => reject(phoneVerificationCancelled());
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function startPhoneVerification(
  phoneNumber: string,
  containerId: string,
  onDiagnostic?: (value: PhoneAuthDiagnostic) => void,
  memoryOnly = false,
  signal?: AbortSignal,
): Promise<{ confirm(code: string): Promise<string>; clear(): void }> {
  const diagnostic = startPhoneDiagnostic(FIREBASE_CDN_VERSION, onDiagnostic);
  let verifier: FirebaseRecaptchaLike | undefined;
  let widgetHost: HTMLElement | undefined;
  let cleared = false;
  const clear = () => {
    signal?.removeEventListener("abort", clear);
    if (cleared) return;
    cleared = true;
    if (verifier) clearRecaptcha(verifier);
    // Firebase 12.19.0 clear() leaves invisible-widget children in place.
    // Remove only this attempt's owned host, after SDK cleanup, never global frames.
    widgetHost?.remove();
  };
  try {
    if (signal?.aborted) throw phoneVerificationCancelled();
    const sdk = await whilePhoneViewActive(firebase(), signal);
    const auth = sdk.auth();
    // Preserve A3's fourth argument: proof credentials must not reach disk.
    // Await before creating a widget or sending SMS; failure has no fallback.
    if (memoryOnly) await whilePhoneViewActive(auth.setPersistence("none"), signal);
    auth.languageCode = "tr";
    diagnostic.stage("recaptcha-create");
    const container = document.getElementById(containerId);
    if (!container?.isConnected) {
      throw Object.assign(new Error("Phone verification view unavailable"), {
        code: "auth/phone-verification-cancelled",
      });
    }
    widgetHost = document.createElement("div");
    container.appendChild(widgetHost);
    verifier = new sdk.auth.RecaptchaVerifier(widgetHost, {
      size: "invisible", badge: "inline", callback: () => diagnostic.recaptchaCompleted(),
    });
    signal?.addEventListener("abort", clear, { once: true });
    diagnostic.stage("phone-request");
    const confirmation = await whilePhoneViewActive(auth.signInWithPhoneNumber(phoneNumber, verifier), signal);
    diagnostic.stage("sms-accepted");
    return {
      async confirm(code: string) {
        return tokenFromCredential(await confirmation.confirm(code));
      },
      clear,
    };
  } catch (error) {
    diagnostic.fail(error);
    clear();
    throw error;
  } finally {
    diagnostic.stop();
  }
}
