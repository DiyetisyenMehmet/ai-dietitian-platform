/** Document-bound Android WebMessage bridge; credentials exist only in memory. */
interface AndroidGoogleBridge {
  postMessage(message: string): void;
  onmessage: ((event: { data: string }) => void) | null;
}

declare global {
  interface Window {
    DiewishGoogleAuth?: AndroidGoogleBridge;
  }
}

const allowedErrors = new Set([
  "auth/configuration-unavailable", "auth/native-cancelled", "auth/native-failed",
  "auth/cancelled-popup-request", "auth/invalid-credential",
]);
let inFlight = false;

function failure(code: string): Error & { code: string } {
  return Object.assign(new Error("Android Google sign-in failed"), { code });
}

export function isAndroidGoogleHost(): boolean {
  return typeof window !== "undefined" && Boolean(
    window.DiewishGoogleAuth || window.__DIEWISH_ANDROID_APP__
    || /DiewishAndroid\//.test(window.navigator?.userAgent ?? ""),
  );
}

export function requestAndroidGoogleToken(projectId: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return Promise.reject(failure("auth/native-cancelled"));
  const bridge = window.DiewishGoogleAuth;
  // Older APKs / unsupported WebViews must never fall back to the broken popup.
  if (!bridge) return Promise.reject(failure("auth/native-unavailable"));
  if (inFlight) return Promise.reject(failure("auth/cancelled-popup-request"));
  let id: string;
  try {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return Promise.reject(failure("auth/native-unavailable"));
  }
  inFlight = true;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", cancel);
      signal?.removeEventListener("abort", cancel);
      bridge.onmessage = null;
      inFlight = false;
    };
    const cancel = () => {
      cleanup();
      try { bridge.postMessage(JSON.stringify({ action: "cancel", id })); } catch { /* host closed */ }
      reject(failure("auth/native-cancelled"));
    };
    const timer = setTimeout(() => {
      cleanup();
      try { bridge.postMessage(JSON.stringify({ action: "cancel", id })); } catch { /* host closed */ }
      reject(failure("auth/native-timeout"));
    }, 120_000);
    window.addEventListener("pagehide", cancel, { once: true });
    signal?.addEventListener("abort", cancel, { once: true });
    bridge.onmessage = (event) => {
      let response: { id?: unknown; idToken?: unknown; error?: unknown };
      try { response = JSON.parse(event.data); } catch { return; }
      if (!response || response.id !== id) return;
      cleanup();
      if (typeof response.idToken === "string" && response.idToken.length > 0
        && response.idToken.length <= 16_384 && !response.error) {
        resolve(response.idToken);
      } else {
        reject(failure(typeof response.error === "string" && allowedErrors.has(response.error)
          ? response.error : "auth/native-failed"));
      }
    };
    try {
      bridge.postMessage(JSON.stringify({ action: "signIn", id, projectId }));
    } catch {
      cleanup();
      reject(failure("auth/native-unavailable"));
    }
  });
}
