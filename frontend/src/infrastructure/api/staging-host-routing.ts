/** Staging-only runtime routing. Never reads credentials or a database URL. */
export const STAGING_APP_HOST = "staging.diewish.com";
export const STAGING_ADMIN_HOST = "admin-staging.diewish.com";
const BACKEND_HOST = "diewish-backend-staging-2qqqfr7wzq-ew.a.run.app";

export interface RoutingEnvironment {
  DIEWISH_STAGING_HOST_ROUTING_ENABLED?: string;
  DIEWISH_STAGING_ADMIN_API_ORIGIN?: string;
  DIEWISH_STAGING_USER_API_ORIGIN?: string;
  NEXT_PUBLIC_API_BASE_URL?: string;
}

export function routingEnabled(env: RoutingEnvironment): boolean {
  // A misspelled activation must not silently use the old build-time rewrite.
  return (
    env.DIEWISH_STAGING_HOST_ROUTING_ENABLED !== undefined &&
    env.DIEWISH_STAGING_HOST_ROUTING_ENABLED !== "false"
  );
}

export function verifiedStagingHost(host: string | null): string | null {
  // Only HTTP Host/authority is used. Forwarded headers are not authority.
  const value = host?.toLowerCase();
  return value === STAGING_APP_HOST || value === STAGING_ADMIN_HOST ? value : null;
}

function fixedOrigin(value: string | undefined, tag: string): string | null {
  const expected = `https://${tag}---${BACKEND_HOST}`;
  return value === expected ? expected : null;
}

export type ApiRoute = { status: 400 | 403 | 421 | 503 } | { destination: string };

export function stagingApiRoute(
  host: string | null,
  pathname: string,
  search: string,
  origin: string | null,
  env: RoutingEnvironment,
): ApiRoute {
  const verifiedHost = verifiedStagingHost(host);
  if (!verifiedHost) return { status: 421 };
  const admin = fixedOrigin(env.DIEWISH_STAGING_ADMIN_API_ORIGIN, "admin-legacy");
  const normal = fixedOrigin(env.DIEWISH_STAGING_USER_API_ORIGIN, "diewish-test2");
  if (
    env.DIEWISH_STAGING_HOST_ROUTING_ENABLED !== "true" ||
    env.NEXT_PUBLIC_API_BASE_URL !== "/api" ||
    !admin ||
    !normal
  )
    return { status: 503 };
  if (origin !== null && origin !== `https://${verifiedHost}`) return { status: 403 };
  if (
    !(pathname === "/api" || pathname.startsWith("/api/")) ||
    /\\|%2f|%5c|%00|%0d|%0a/i.test(pathname) ||
    (search !== "" && !search.startsWith("?"))
  )
    return { status: 400 };
  return {
    destination: (verifiedHost === STAGING_ADMIN_HOST ? admin : normal) + pathname + search,
  };
}

export function stagingRequestHeaders(headers: Headers, host: string): Headers {
  const result = new Headers(headers);
  for (const name of [...result.keys()]) {
    if (
      name === "forwarded" ||
      name === "x-original-host" ||
      name === "x-host" ||
      name === "x-original-url" ||
      name === "x-rewrite-url" ||
      name.startsWith("x-middleware-")
    )
      result.delete(name);
  }
  result.set("x-forwarded-host", host);
  result.set("x-forwarded-proto", "https");
  result.set("x-forwarded-port", "443");
  // Preserve Authorization, Cookie, Origin, body and existing client-IP chain.
  return result;
}
