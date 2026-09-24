import { NextResponse, type NextRequest } from "next/server";

import {
  ADMIN_PRODUCTION_HOST,
  ADMIN_STAGING_HOST,
} from "@/shared/constants/admin";

function normalizeHost(value: string | null): string {
  return (value ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function requestHost(request: NextRequest): string {
  return normalizeHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
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
  const host = requestHost(request);
  const pathname = request.nextUrl.pathname;

  // Production Management Center is not launched. Even if DNS is accidentally
  // pointed at this service, do not expose an admin surface.
  if (host === ADMIN_PRODUCTION_HOST) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (host !== ADMIN_STAGING_HOST) {
    return NextResponse.next();
  }

  if (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    isStaticAsset(pathname)
  ) {
    return NextResponse.next();
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/admin", request.url));
}

export const config = {
  matcher: ["/:path*"],
};
