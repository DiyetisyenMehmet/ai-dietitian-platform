export interface PhoneAuthDiagnostic {
  at: string;
  sdk: string;
  stage: "config-and-sdk" | "recaptcha-create" | "phone-request" | "sms-accepted";
  recaptchaCompleted: boolean;
  requests: { endpoint: string; status: number; error?: string }[];
  failure?: { name: string; code: string; reason?: string };
}

export function isStagingPhoneDiagnostics(): boolean {
  return typeof window !== "undefined" && [
    "staging.diewish.com",
    "diewish-frontend-staging-730419163638.europe-west1.run.app",
    "diewish-frontend-staging-2qqqfr7wzq-ew.a.run.app",
  ].includes(window.location?.hostname);
}

// Never retain request bodies, phone numbers, tokens, query strings or raw
// upstream messages. Only these bounded, machine-readable error identifiers
// can enter the diagnostic shown on staging and in the developer console.
export function safePhoneFailure(error: unknown): NonNullable<PhoneAuthDiagnostic["failure"]> {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof value.code === "string" && /^auth\/[a-z][a-z0-9:-]{1,70}$/.test(value.code)
    ? value.code : "unknown";
  const name = ["Error", "FirebaseError", "TypeError", "ReferenceError", "SyntaxError", "ApiError"].includes(String(value.name))
    ? String(value.name) : "Error";
  const knownReasons: Record<string, string> = {
    "reCAPTCHA has already been rendered in this element": "recaptcha-already-rendered",
    "reCAPTCHA placeholder element must be an element or id": "recaptcha-container-missing",
    "Unable to load external scripts": "sdk-script-loader-unavailable",
  };
  const reason = typeof value.message === "string" ? knownReasons[value.message] : undefined;
  return { name, code, ...(reason ? { reason } : {}) };
}

export function startPhoneDiagnostic(sdk: string, publish?: (value: PhoneAuthDiagnostic) => void) {
  const state: PhoneAuthDiagnostic = {
    at: new Date().toISOString(), sdk, stage: "config-and-sdk", recaptchaCompleted: false, requests: [],
  };
  const emit = () => {
    try { publish?.({ ...state, requests: [...state.requests] }); } catch { /* Diagnostics cannot break sign-in. */ }
  };
  const original = typeof window !== "undefined" ? window.fetch : undefined;
  let observed: typeof fetch | undefined;
  if (isStagingPhoneDiagnostics() && original) {
    observed = async (input, init) => {
      let endpoint: string | undefined;
      try {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
        if (url.origin === window.location.origin && url.pathname === "/api/identity/firebase-config") endpoint = "runtime-config";
        if (url.hostname === "identitytoolkit.googleapis.com") {
          endpoint = ({
            "/v1/recaptchaParams": "recaptcha-params",
            "/v2/recaptchaConfig": "recaptcha-config",
            "/v1/accounts:sendVerificationCode": "send-verification-code",
          } as Record<string, string>)[url.pathname];
        }
      } catch { /* Preserve fetch's original validation and error. */ }
      try {
        const response = await original.call(window, input, init);
        if (endpoint && state.requests.length < 12) {
          const entry: PhoneAuthDiagnostic["requests"][number] = { endpoint, status: response.status };
          if (!response.ok) {
            try {
              const body = await response.clone().json();
              const message = body?.error?.message;
              if (typeof message === "string") {
                entry.error = message.match(/^[A-Z][A-Z_]{2,79}(?= : |$)/)?.[0]
                  ?? message.match(/^Error code: -?\d{1,3}$/)?.[0];
              }
            } catch { /* Non-JSON responses still retain the HTTP status. */ }
          }
          state.requests.push(entry);
          emit();
        }
        return response;
      } catch (error) {
        if (endpoint && state.requests.length < 12) {
          state.requests.push({ endpoint, status: 0, error: "NETWORK_FAILURE" });
          emit();
        }
        throw error;
      }
    };
    window.fetch = observed;
  }
  emit();
  return {
    stage(stage: PhoneAuthDiagnostic["stage"]) { state.stage = stage; emit(); },
    recaptchaCompleted() { state.recaptchaCompleted = true; emit(); },
    fail(error: unknown) {
      state.failure = safePhoneFailure(error);
      console.warn(`[identity:phone] ${JSON.stringify(state)}`);
      emit();
    },
    stop() { if (observed && window.fetch === observed) window.fetch = original!; },
  };
}
