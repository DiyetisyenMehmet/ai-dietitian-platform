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

/**
 * Optional bearer-token provider. The auth store registers a getter here so the
 * transport layer can attach the access token WITHOUT importing the store
 * (keeping this layer framework-agnostic and dependency-free).
 */
let accessTokenProvider: (() => string | null) | null = null;

/**
 * Optional single-flight refresh callback registered by the auth store. It is
 * invoked only after an authenticated request receives HTTP 401 and must return
 * a fresh access token, or null when the session can no longer be refreshed.
 */
let unauthorizedHandler: (() => Promise<string | null>) | null = null;

/** Registers (or clears) the access-token getter used to authorize requests. */
export function setAccessTokenProvider(provider: (() => string | null) | null): void {
  accessTokenProvider = provider;
}

/** Registers (or clears) the handler used to refresh an expired session. */
export function setUnauthorizedHandler(handler: (() => Promise<string | null>) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions extends RequestInit {
  /** Path relative to the configured API base URL, e.g. "/health". */
  path: string;
  /** When true, attaches the current access token as a Bearer header. */
  auth?: boolean;
}

/** Standard success envelope returned by the backend. */
interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

/** Standard error envelope returned by the backend. */
interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

function isFormDataBody(body: BodyInit | null | undefined): boolean {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

/**
 * Builds request headers without forcing application/json on multipart uploads.
 * Caller-supplied headers always win, except that an authenticated request gets
 * the current Bearer token when one is available.
 */
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
      headers: buildHeaders(headers, init.body, auth, token),
    });
  } catch {
    throw new ApiError("Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edin.", 0);
  }
}

/**
 * Thin, framework-agnostic HTTP client wrapping fetch. It unwraps the backend's
 * `{ success, data }` envelope and normalizes `{ success: false, error }` into
 * a typed {@link ApiError}.
 *
 * Authenticated requests automatically retry once after a 401 when the auth
 * store can rotate the refresh token. This prevents a normal 15-minute access
 * token expiry from forcing the user to sign in again.
 */
export async function apiRequest<TResponse>({
  path,
  headers,
  auth = false,
  ...init
}: RequestOptions): Promise<TResponse> {
  if (!isApiConfigured()) {
    throw new ApiError("Backend API yapılandırması bulunamadı.", 0);
  }

  const url = `${env.apiBaseUrl.replace(/\/$/, "")}${path}`;
  let response = await performFetch(url, init, headers, auth, accessTokenProvider?.() ?? null);

  // Access tokens are deliberately short-lived. When an authenticated request
  // receives 401, ask the auth layer to rotate the refresh token and retry the
  // original request exactly once with the fresh access token. The refresh call
  // itself is unauthenticated, so this path cannot recurse indefinitely.
  if (auth && response.status === 401 && unauthorizedHandler) {
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

  // 204 No Content — nothing to parse.
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
    const message = err?.error?.message ?? `İstek başarısız oldu (${response.status}).`;
    throw new ApiError(message, response.status, err?.error?.code);
  }

  // Unwrap the success envelope when present; otherwise return the raw body.
  if (body && typeof body === "object" && "success" in body) {
    return (body as SuccessEnvelope<TResponse>).data;
  }
  return body as TResponse;
}
