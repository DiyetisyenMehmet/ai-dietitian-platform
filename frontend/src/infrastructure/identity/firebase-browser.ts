import { apiRequest } from "@/infrastructure/api/http-client";

const FIREBASE_CDN_VERSION = "10.14.1";

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

interface FirebaseAuthLike {
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
    container: string,
    parameters?: { size?: "invisible" | "normal" },
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
  const compiled = buildTimeConfig();
  if (compiled) return compiled;

  if (!runtimeConfigPromise) {
    runtimeConfigPromise = apiRequest<PublicFirebaseConfigResponse>({
      path: "/identity/firebase-config",
      method: "GET",
      retryOnUnauthorized: false,
    })
      .then((result) => (result.configured ? result.config : null))
      .catch(() => null);
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
    script.onerror = () => reject(new Error("Kimlik doğrulama servisi yüklenemedi."));
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

export async function startPhoneVerification(
  phoneNumber: string,
  containerId: string,
): Promise<{ confirm(code: string): Promise<string>; clear(): void }> {
  const sdk = await firebase();
  const verifier = new sdk.auth.RecaptchaVerifier(containerId, { size: "invisible" });
  try {
    const confirmation = await sdk.auth().signInWithPhoneNumber(phoneNumber, verifier);
    return {
      async confirm(code: string) {
        return tokenFromCredential(await confirmation.confirm(code));
      },
      clear() {
        verifier.clear();
      },
    };
  } catch (error) {
    verifier.clear();
    throw error;
  }
}
