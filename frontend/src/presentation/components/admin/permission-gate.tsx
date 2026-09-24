"use client";

import * as React from "react";

import type { AdminPermission } from "@/infrastructure/admin/admin-client";

interface PermissionGateProps {
  permissions: readonly AdminPermission[];
  require: AdminPermission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * UX-only permission gate. Backend authorization remains authoritative.
 */
export function PermissionGate({
  permissions,
  require,
  children,
  fallback = null,
}: PermissionGateProps) {
  return permissions.includes(require) ? <>{children}</> : <>{fallback}</>;
}
