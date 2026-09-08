import { env, isApiConfigured } from "@/application/config/env";

/** Error thrown for any non-successful or failed HTTP interaction. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable error code from the API envelope, when present. */
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let accessTokenProvider: (() => string | null) | null = null;
let unauthorizedHandler: (() => Promise<string | null>) | null = null;

export function setAccessTokenProvider(provider: (() => string | null) | null): void {
  accessTokenProvider = provider;
}

export function setUnauthorizedHandler(handler: (() => Promise<string | null>) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions extends RequestInit {
  path: string;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

const CONSENT_REQUIRED_CODE = "CONSENT_REQUIRED";
const CONSENT_ROUTE = "/consent";
const CONSENT_RETURN_TO_KEY = "diewish:consent:return-to";

function isFormDataBody(body: BodyInit | null | undefined): boolean {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function redirectToConsent(): void {
  if (typeof window === "undefined" || window.location.pathname === CONSENT_ROUTE) return;

  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  try {
    window.sessionStorage.setItem(CONSENT_RETURN_TO_KEY, returnTo);
  } catch {
    // Consent recovery still works when storage is unavailable.
  }
  window.location.assign(CONSENT_ROUTE);
}

function buildHeaders(
  initial: HeadersInit | undefined,
  body: BodyInit | null | undefined,
  auth: boolean,
  token: string | null,
): Headers {
  const headers = new Headers(initial);

  if (body != null && !isFormDataBody(body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (auth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

async function performFetch(
  url: string,
  init: RequestInit,
  headers: HeadersInit | undefined,
  auth: boolean,
  token: string | null,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      // Refresh sessions live in an HttpOnly cookie. Keep credentials enabled
      // for same-origin and configured cross-origin API calls unless a caller
      // deliberately overrides the fetch credential mode.
      credentials: init.credentials ?? "include",
      headers: buildHeaders(headers, init.body, auth, token),
    });
  } catch {
    throw new ApiError("Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edin.", 0);
  }
}

/**
 * Thin, framework-agnostic HTTP client. Authenticated requests retry exactly
 * once after a 401 through the auth store's single-flight refresh handler.
 * Multipart bodies keep their browser-generated boundary and consent failures
 * retain the existing recovery redirect.
 */
export async function apiRequest<TResponse>({
  path,
  headers,
  auth = false,
  retryOnUnauthorized = true,
  ...init
}: RequestOptions): Promise<TResponse> {
  if (!isApiConfigured()) {
    throw new ApiError("Backend API yapılandırması bulunamadı.", 0);
  }

  const url = `${env.apiBaseUrl.replace(/\/$/, "")}${path}`;
  let response = await performFetch(url, init, headers, auth, accessTokenProvider?.() ?? null);

  if (auth && retryOnUnauthorized && response.status === 401 && unauthorizedHandler) {
    let refreshedToken: string | null = null;
    try {
      refreshedToken = await unauthorizedHandler();
    } catch {
      refreshedToken = null;
    }

    if (refreshedToken) {
      response = await performFetch(url, init, headers, auth, refreshedToken);
    }
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const err = body as ErrorEnvelope | null;
    const code = err?.error?.code;

    if (auth && code === CONSENT_REQUIRED_CODE) {
      redirectToConsent();
      throw new ApiError(
        "Devam etmek için güncel yasal onaylarını tamamlaman gerekiyor.",
        response.status,
        code,
      );
    }

    const message = err?.error?.message ?? `İstek başarısız oldu (${response.status}).`;
    throw new ApiError(message, response.status, code);
  }

  if (body && typeof body === "object" && "success" in body) {
    return (body as SuccessEnvelope<TResponse>).data;
  }
  return body as TResponse;
}
