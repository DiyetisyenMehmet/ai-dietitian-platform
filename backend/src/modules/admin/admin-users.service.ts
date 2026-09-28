import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { buildPaginationMeta } from "../../utils/api-response";
import type { AdminUsersQuery } from "./admin-users.schemas";

// Security boundary: never fetch profile, health, credential or session relations.
export const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  lastLoginAt: true,
  emailVerifiedAt: true,
  onboardingCompleted: true,
  subscriptionTier: true,
} satisfies Prisma.UserSelect;
type SafeUser = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_SELECT }>;

// A second allowlist prevents accidental serialization if the query grows later.
export function adminUserDto(user: SafeUser) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    emailVerifiedAt: user.emailVerifiedAt,
    onboardingCompleted: user.onboardingCompleted,
    subscriptionTier: user.subscriptionTier,
  };
}

export const adminUsersService = {
  async list(query: AdminUsersQuery) {
    const where: Prisma.UserWhereInput = {
      ...(query.status === "all" ? {} : { isActive: query.status === "active" }),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: "insensitive" as const } },
              { id: query.search },
            ],
          }
        : {}),
    };
    const [total, users] = await prisma.$transaction(
      [
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          select: ADMIN_USER_SELECT,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      users: users.map(adminUserDto),
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  },
  async detail(id: string) {
    const user = await prisma.user.findUnique({ where: { id }, select: ADMIN_USER_SELECT });
    if (!user) throw ApiError.notFound("User not found.");
    return { user: adminUserDto(user) };
  },
};
