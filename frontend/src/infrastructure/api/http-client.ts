import { env, isApiConfigured } from "@/application/config/env";

/** Error thrown for any non-successful or failed HTTP interaction. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends RequestInit {
  /** Path relative to the configured API base URL, e.g. "/health". */
  path: string;
}

/**
 * Thin, framework-agnostic HTTP client wrapping fetch.
 * Endpoints are provided by callers; this layer defines no domain endpoints.
 */
export async function apiRequest<TResponse>({
  path,
  headers,
  ...init
}: RequestOptions): Promise<TResponse> {
  if (!isApiConfigured()) {
    throw new ApiError("Backend API yapılandırması bulunamadı.", 0);
  }

  const url = `${env.apiBaseUrl.replace(/\/$/, "")}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    });
  } catch {
    throw new ApiError("Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edin.", 0);
  }

  if (!response.ok) {
    throw new ApiError(`İstek başarısız oldu (${response.status}).`, response.status);
  }

  return (await response.json()) as TResponse;
}
