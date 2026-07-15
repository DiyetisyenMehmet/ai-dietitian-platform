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

/** Registers (or clears) the access-token getter used to authorize requests. */
export function setAccessTokenProvider(provider: (() => string | null) | null): void {
  accessTokenProvider = provider;
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

/**
 * Thin, framework-agnostic HTTP client wrapping fetch. It unwraps the backend's
 * `{ success, data }` envelope and normalizes `{ success: false, error }` into
 * a typed {@link ApiError}. Endpoints are provided by callers; this layer
 * defines no domain endpoints.
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

  const authHeaders: Record<string, string> = {};
  if (auth) {
    const token = accessTokenProvider?.() ?? null;
    if (token) authHeaders.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...headers,
      },
    });
  } catch {
    throw new ApiError("Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edin.", 0);
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
