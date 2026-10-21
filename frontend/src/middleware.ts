import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_PRODUCTION_HOST, ADMIN_STAGING_HOST } from "@/shared/constants/admin";

import {
  routingEnabled,
  stagingApiRoute,
  stagingRequestHeaders,
  verifiedStagingHost,
} from "@/infrastructure/api/staging-host-routing";

function normalizeHost(value: string | null): string {
  return (value ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

function requestHost(request: NextRequest): string {
  return normalizeHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    /\.[a-z0-9]{2,8}$/i.test(pathname)
  );
}

/**
 * Host-level separation for the Management Center.
 *
 * This is a presentation/routing boundary only. Real authorization remains
 * backend Authentication -> ADMIN -> RBAC permission checks.
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Runtime-only settings; absent/false keeps the approved existing behavior.
  const routingEnv = {
    DIEWISH_STAGING_HOST_ROUTING_ENABLED: process.env.DIEWISH_STAGING_HOST_ROUTING_ENABLED,
    DIEWISH_STAGING_ADMIN_API_ORIGIN: process.env.DIEWISH_STAGING_ADMIN_API_ORIGIN,
    DIEWISH_STAGING_USER_API_ORIGIN: process.env.DIEWISH_STAGING_USER_API_ORIGIN,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  };
  const isolated = routingEnabled(routingEnv);
  const host = isolated ? verifiedStagingHost(request.headers.get("host")) : requestHost(request);
  const next = () =>
    isolated && host
      ? NextResponse.next({ request: { headers: stagingRequestHeaders(request.headers, host) } })
      : NextResponse.next();
  if (isolated) {
    const api = pathname === "/api" || pathname.startsWith("/api/");
    if (!host)
      return new NextResponse("Misdirected Request", {
        status: 421,
        headers: { "Cache-Control": "no-store" },
      });
    // Encoded API prefixes must not fall through to the build-time rewrite.
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return new NextResponse("Bad Request", { status: 400 });
    }
    if (
      !api &&
      (decoded === "/api" || decoded.startsWith("/api/") || decoded.startsWith("/api\\"))
    ) {
      return new NextResponse("Bad Request", {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (api) {
      const route = stagingApiRoute(
        request.headers.get("host"),
        pathname,
        request.nextUrl.search,
        request.headers.get("origin"),
        routingEnv,
      );
      if ("status" in route)
        return new NextResponse("Staging API routing unavailable", {
          status: route.status,
          headers: { "Cache-Control": "no-store" },
        });
      return NextResponse.rewrite(route.destination, {
        request: { headers: stagingRequestHeaders(request.headers, host) },
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  // Production Management Center is not launched. Even if DNS is accidentally
  // pointed at this service, do not expose an admin surface.
  if (host === ADMIN_PRODUCTION_HOST) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (host !== ADMIN_STAGING_HOST) {
    return next();
  }

  if (pathname === "/api" || pathname.startsWith("/api/") || isStaticAsset(pathname)) {
    return next();
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/admin", isolated ? `https://${host}` : request.url));
  }

  if (pathname === "/login") {
    return NextResponse.redirect(
      new URL("/admin/login", isolated ? `https://${host}` : request.url),
    );
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return next();
  }

  return NextResponse.redirect(new URL("/admin", isolated ? `https://${host}` : request.url));
}

export const config = {
  matcher: ["/:path*"],
};
