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
let refreshHandler: (() => Promise<void>) | null = null;
let authFailureHandler: (() => void) | null = null;
let refreshPromise: Promise<void> | null = null;

export function setAccessTokenProvider(provider: (() => string | null) | null): void {
  accessTokenProvider = provider;
}

/** Registers the one shared session-refresh operation used after authenticated 401s. */
export function setAuthRefreshHandler(handler: (() => Promise<void>) | null): void {
  refreshHandler = handler;
}

/** Registers the callback used when refresh fails and the session must be cleared. */
export function setAuthFailureHandler(handler: (() => void) | null): void {
  authFailureHandler = handler;
}

interface RequestOptions extends RequestInit {
  path: string;
  auth?: boolean;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

async function runSingleFlightRefresh(): Promise<void> {
  if (!refreshHandler) {
    throw new ApiError("Oturum yenilenemedi.", 401);
  }
  if (!refreshPromise) {
    refreshPromise = refreshHandler().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function executeRequest<TResponse>(
  { path, headers, auth = false, ...init }: RequestOptions,
  alreadyRetried: boolean,
): Promise<TResponse> {
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
      credentials: init.credentials ?? "include",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...headers,
      },
    });
  } catch {
    throw new ApiError("Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edin.", 0);
  }

  // Only authenticated resource requests participate in automatic refresh.
  // Refresh itself is sent with auth=false, so this cannot recurse indefinitely.
  if (response.status === 401 && auth && !alreadyRetried) {
    try {
      await runSingleFlightRefresh();
      return executeRequest<TResponse>({ path, headers, auth, ...init }, true);
    } catch {
      authFailureHandler?.();
      throw new ApiError("Oturumunuz sona erdi. Lütfen tekrar giriş yapın.", 401);
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
    const message = err?.error?.message ?? `İstek başarısız oldu (${response.status}).`;
    throw new ApiError(message, response.status, err?.error?.code);
  }

  if (body && typeof body === "object" && "success" in body) {
    return (body as SuccessEnvelope<TResponse>).data;
  }
  return body as TResponse;
}

/**
 * Thin HTTP client with credentialed cookie transport and single-flight access
 * token recovery. Every authenticated request is retried at most once.
 */
export function apiRequest<TResponse>(options: RequestOptions): Promise<TResponse> {
  return executeRequest<TResponse>(options, false);
}
