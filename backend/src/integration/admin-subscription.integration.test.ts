import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { UserRole } from "@prisma/client";

import { createApp } from "../app";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { bootstrapAdminFoundation } from "../modules/admin/admin.bootstrap";
import type { AdminUserSubscriptionView } from "../modules/admin/admin-user-subscription.service";
import { googlePlayEntitlementsRepository } from "../modules/payments/google-play-entitlements.repository";
import { signAccessToken } from "../utils/jwt";

test("B1 read-only subscription management: canonical source, RBAC and data minimization", async (t) => {
  await bootstrapAdminFoundation();
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const prefix = `b1-${crypto.randomUUID()}`;
  const ids: string[] = [];

  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.adminUserRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  async function create(suffix: string, role: UserRole, roleKey?: string) {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${suffix}@example.com`,
        passwordHash: "B1-CREDENTIAL-SENTINEL",
        role,
        fullName: "B1 test",
      },
    });
    ids.push(user.id);
    if (roleKey) {
      const assignment = await prisma.adminRole.findUniqueOrThrow({ where: { key: roleKey } });
      await prisma.adminUserRole.create({ data: { userId: user.id, roleId: assignment.id } });
    }
    return {
      user,
      token: signAccessToken({ userId: user.id, email: user.email, role }),
    };
  }

  const free = await create("free", UserRole.USER);
  const paid = await create("paid", UserRole.USER);
  const expired = await create("expired", UserRole.USER);
  const play = await create("play", UserRole.USER);
  const normal = await create("normal", UserRole.USER);
  const support = await create("support", UserRole.ADMIN, "SUPPORT");
  const finance = await create("finance", UserRole.ADMIN, "FINANCE");
  const owner = await create("owner", UserRole.ADMIN, "SUPER_ADMIN");

  const now = Date.now();

  await prisma.user.update({
    where: { id: paid.user.id },
    data: { subscriptionTier: "PREMIUM" },
  });
  await prisma.subscription.create({
    data: {
      userId: paid.user.id,
      tier: "PREMIUM",
      status: "ACTIVE",
      provider: "IYZICO",
      providerRef: "B1-PROVIDER-REF-SENTINEL",
      providerSubscriptionRef: "B1-PROVIDER-SUBSCRIPTION-SENTINEL",
      currentPeriodStart: new Date(now - 3 * 86400000),
      currentPeriodEnd: new Date(now + 27 * 86400000),
    },
  });
  await prisma.payment.create({
    data: {
      userId: paid.user.id,
      status: "SUCCEEDED",
      amountMinor: 14999,
      providerPaymentId: "B1-PAYMENT-ID-SENTINEL",
      providerConversationId: "B1-PAYMENT-CONVERSATION-SENTINEL",
      rawStatus: "B1-RAW-PAYMENT-SENTINEL",
      failureReason: "B1-PAYMENT-FAILURE-SENTINEL",
    },
  });

  await prisma.user.update({
    where: { id: expired.user.id },
    data: { subscriptionTier: "PREMIUM_PLUS" },
  });
  const expiredRow = await prisma.subscription.create({
    data: {
      userId: expired.user.id,
      tier: "PREMIUM_PLUS",
      status: "ACTIVE",
      currentPeriodStart: new Date(now - 40 * 86400000),
      currentPeriodEnd: new Date(now - 10 * 86400000),
    },
  });

  await googlePlayEntitlementsRepository.grantVerified({
    userId: play.user.id,
    purchaseTokenHash: crypto.createHash("sha256").update("B1-PLAY-TOKEN-SENTINEL").digest("hex"),
    linkedPurchaseTokenHash: null,
    productId: "B1-PLAY-PRODUCT-SENTINEL",
    tier: "PREMIUM_PLUS",
    orderId: "B1-PLAY-ORDER-SENTINEL",
    rawState: "SUBSCRIPTION_STATE_ACTIVE",
    startedAt: new Date(now - 2 * 86400000),
    expiresAt: new Date(now + 28 * 86400000),
  });

  await prisma.userProfile.create({
    data: {
      userId: paid.user.id,
      dateOfBirth: new Date("1990-01-01"),
      gender: "OTHER",
      heightCm: 170,
      currentWeightKg: 70,
      targetWeightKg: 65,
      activityLevel: "SEDENTARY",
      healthConditions: ["B1-HEALTH-SENTINEL"],
      allergies: ["B1-ALLERGY-SENTINEL"],
      dietaryPreference: "OMNIVORE",
      dailyWaterGoalMl: 2000,
    },
  });

  const get = (userId: string, token: string) =>
    fetch(`${origin}/api/admin/users/${userId}/subscription`, {
      headers: { authorization: `Bearer ${token}` },
    });
  const read = async (response: Response) =>
    (await response.json()) as { data: { subscription: AdminUserSubscriptionView } };

  await t.test("normal users and admins without entitlement permission are denied", async () => {
    assert.equal((await get(free.user.id, normal.token)).status, 403);
    assert.equal((await get(free.user.id, support.token)).status, 403);
    assert.equal((await get(free.user.id, finance.token)).status, 200);
    assert.equal((await get(free.user.id, owner.token)).status, 200);
  });

  await t.test("free user and missing subscription return explicit read-only empty state", async () => {
    const response = await get(free.user.id, finance.token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const { subscription } = (await read(response)).data;
    assert.equal(subscription.currentPlan, "FREE");
    assert.equal(subscription.currentPlanSource, "ACCOUNT_DEFAULT");
    assert.equal(subscription.entitlementStatus, "FREE");
    assert.equal(subscription.record, null);
    assert.ok(subscription.entitlements.includes("DIETITIAN_CHAT"));
  });

  await t.test("active iyzico and Google Play paid states use real entitlement sources", async () => {
    const legacy = (await read(await get(paid.user.id, finance.token))).data.subscription;
    assert.equal(legacy.currentPlan, "PREMIUM");
    assert.equal(legacy.currentPlanSource, "IYZICO_SUBSCRIPTION");
    assert.equal(legacy.entitlementStatus, "ACTIVE");
    assert.equal(legacy.record?.provider, "IYZICO");
    assert.equal(legacy.record?.status, "ACTIVE");
    assert.ok(legacy.record?.startDate);
    assert.ok(legacy.record?.expiryOrRenewalDate);

    const google = (await read(await get(play.user.id, finance.token))).data.subscription;
    assert.equal(google.currentPlan, "PREMIUM_PLUS");
    assert.equal(google.currentPlanSource, "GOOGLE_PLAY_ENTITLEMENT");
    assert.equal(google.record?.provider, "GOOGLE_PLAY");
    assert.equal(google.record?.status, "ACTIVE");
  });

  await t.test("expired legacy state is reported without repairing or mutating it", async () => {
    const response = (await read(await get(expired.user.id, finance.token))).data.subscription;
    assert.equal(response.currentPlan, "FREE");
    assert.equal(response.entitlementStatus, "FREE");
    assert.equal(response.record?.status, "EXPIRED");
    assert.equal(response.record?.provider, "IYZICO");

    const [userAfter, subscriptionAfter] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: expired.user.id } }),
      prisma.subscription.findUniqueOrThrow({ where: { id: expiredRow.id } }),
    ]);
    assert.equal(userAfter.subscriptionTier, "PREMIUM_PLUS");
    assert.equal(subscriptionAfter.status, "ACTIVE");
  });

  await t.test("response DTO excludes payment, provider credential and health data", async () => {
    const body = await read(await get(paid.user.id, finance.token));
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(
      serialized,
      /passwordHash|providerRef|providerSubscriptionRef|providerPaymentId|providerConversationId|purchaseToken|tokenHash|orderId|rawState|failureReason|healthConditions|allergies|B1-.*SENTINEL/i,
    );
    assert.deepEqual(Object.keys(body.data.subscription).sort(), [
      "currentPlan",
      "currentPlanSource",
      "entitlementStatus",
      "entitlements",
      "record",
    ].sort());
  });

  await t.test("missing user and production environment fail closed", async () => {
    assert.equal((await get(crypto.randomUUID(), finance.token)).status, 404);
    const previous = env.DIEWISH_ENVIRONMENT;
    try {
      env.DIEWISH_ENVIRONMENT = "production";
      assert.equal((await get(free.user.id, owner.token)).status, 403);
    } finally {
      env.DIEWISH_ENVIRONMENT = previous;
    }
  });
});
