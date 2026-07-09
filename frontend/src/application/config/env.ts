/**
 * Centralized, type-safe access to runtime environment configuration.
 * Only NEXT_PUBLIC_* values are readable on the client.
 */
export const env = {
  /** Base URL of the backend REST API. Configured per environment. */
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  /** Current runtime environment label. */
  nodeEnv: process.env.NODE_ENV ?? "development",
} as const;

/** True when a backend API base URL has been configured. */
export const isApiConfigured = (): boolean => env.apiBaseUrl.trim().length > 0;
