import { UserRole } from "@prisma/client";

import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { stagingAutomationPaused } from "../../scheduler/automation-policy";
import { getAdminEnvironmentIdentity } from "./admin.environment";

export type SystemStatus = "healthy" | "attention" | "problem" | "unknown";
export interface SystemCheck {
  status: SystemStatus;
  detail: string;
}

// Only fixed, explicitly selected operational fields leave this module. Never
// include provider responses, error objects, connection strings or environment maps.
export function configuredChecks() {
  return {
    backend: { status: "healthy", detail: "Yönetim API isteği yanıtlandı." },
    frontend: { status: "unknown", detail: "Henüz bağımsız olarak izlenmiyor." },
    authentication: {
      status: env.FIREBASE_WEB_API_KEY.trim() ? "healthy" : "attention",
      detail: env.FIREBASE_WEB_API_KEY.trim()
        ? "Oturum doğrulandı; harici kimlik sağlayıcı yapılandırılmış. Sağlayıcı erişimi sınanmadı."
        : "Oturum doğrulandı; harici kimlik sağlayıcı yapılandırılmamış.",
    },
    scheduler: {
      status: stagingAutomationPaused() ? "attention" : "unknown",
      detail: stagingAutomationPaused()
        ? "Test ortamı otomasyonu yapılandırma gereği duraklatılmış."
        : "Zamanlayıcının son çalışması henüz izlenmiyor.",
    },
    criticalServices: { status: "unknown", detail: "Harici servisler henüz izlenmiyor." },
  } satisfies Record<string, SystemCheck>;
}

export function overallStatus(checks: Record<string, SystemCheck>): SystemStatus {
  const values = Object.values(checks).map((check) => check.status);
  if (values.includes("problem")) return "problem";
  if (values.includes("attention")) return "attention";
  if (values.includes("unknown")) return "unknown";
  return "healthy";
}

export async function readSystemHealth() {
  let database: SystemCheck;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
        await tx.$queryRaw`SELECT 1`;
      },
      { maxWait: 1500, timeout: 2500 },
    );
    database = {
      status: "healthy",
      detail: "Bu Admin sunucusunun veritabanı bağlantısı doğrulandı.",
    };
  } catch {
    database = { status: "problem", detail: "Veritabanı kontrolü tamamlanamadı." };
  }
  const checks = { ...configuredChecks(), database };
  return {
    ...getAdminEnvironmentIdentity(),
    status: overallStatus(checks),
    checks,
    timestamp: new Date().toISOString(),
    scope: "admin-runtime" as const,
  };
}

export async function readOperationsSummary() {
  // One bounded aggregate, no per-user fetches or health joins. Account plan
  // counts deliberately do not claim to resolve effective provider entitlements.
  const groups = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
      return tx.user.groupBy({
        by: ["isActive", "subscriptionTier"],
        where: { role: UserRole.USER },
        _count: { _all: true },
      });
    },
    { maxWait: 1500, timeout: 2500 },
  );
  const plans = { FREE: 0, PREMIUM: 0, PREMIUM_PLUS: 0 };
  let active = 0;
  let inactive = 0;
  for (const row of groups) {
    plans[row.subscriptionTier] += row._count._all;
    if (row.isActive) active += row._count._all;
    else inactive += row._count._all;
  }
  return {
    users: { total: active + inactive, active, inactive },
    accountPlans: plans,
    planBasis: "stored-account-tier" as const,
    effectiveSubscriptions: null,
    timestamp: new Date().toISOString(),
    scope: "admin-database" as const,
  };
}

// Small per-process snapshots bound dashboard refresh cost. Authorization stays
// on every request outside this cache; no user-specific data is cached here.
function snapshot<T>(read: () => Promise<T>, ttl: number) {
  let cached: { value: T; until: number } | undefined;
  let pending: Promise<T> | undefined;
  return () => {
    if (cached && cached.until > Date.now()) return Promise.resolve(cached.value);
    if (!pending) {
      pending = read()
        .then((value) => {
          cached = { value, until: Date.now() + ttl };
          return value;
        })
        .finally(() => {
          pending = undefined;
        });
    }
    return pending;
  };
}

export const adminSystemService = {
  health: snapshot(readSystemHealth, 15_000),
  operations: snapshot(readOperationsSummary, 30_000),
};
