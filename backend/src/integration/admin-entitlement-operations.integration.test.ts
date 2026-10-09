import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { UserRole } from "@prisma/client";

import { createApp } from "../app";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { bootstrapAdminFoundation } from "../modules/admin/admin.bootstrap";
import { adminEntitlementOperationsService } from "../modules/admin/admin-entitlement-operations.service";
import { googlePlayEntitlementsRepository } from "../modules/payments/google-play-entitlements.repository";
import { readEffectiveSubscriptionState } from "../modules/payments/subscription-state";
import { entitlementsForTier } from "../modules/payments/entitlements";
import { signAccessToken } from "../utils/jwt";

test("B2 controlled support entitlement operations", async (t) => {
  await bootstrapAdminFoundation();
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const prefix = `b2-${crypto.randomUUID()}`;
  const userIds: string[] = [];
  const customRoleKey = `B2_READER_${crypto.randomUUID()}`;

  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.adminUserRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.adminRole.deleteMany({ where: { key: customRoleKey } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const permissionRows = await prisma.adminPermission.findMany({
    where: {
      key: { in: ["admin.access", "users.read", "entitlements.read"] },
    },
    select: { id: true },
  });
  const readerRole = await prisma.adminRole.create({
    data: {
      key: customRoleKey,
      name: "B2 Read Only",
      description: "Isolated B2 read-only integration role",
      isSystem: false,
      permissions: {
        createMany: {
          data: permissionRows.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
    },
  });

  async function create(suffix: string, role: UserRole, roleKey?: string) {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${suffix}@example.com`,
        passwordHash: "B2-CREDENTIAL-SENTINEL",
        role,
        fullName: "B2 test",
      },
    });
    userIds.push(user.id);
    if (roleKey) {
      const assignment = await prisma.adminRole.findUniqueOrThrow({
        where: { key: roleKey },
      });
      await prisma.adminUserRole.create({
        data: { userId: user.id, roleId: assignment.id },
      });
    }
    return {
      user,
      bearer: signAccessToken({
        userId: user.id,
        email: user.email,
        role,
      }),
    };
  }

  const target = await create("target", UserRole.USER);
  const duplicateTarget = await create("duplicate", UserRole.USER);
  const rollbackTarget = await create("rollback", UserRole.USER);
  const iyzicoTarget = await create("iyzico", UserRole.USER);
  const playTarget = await create("play", UserRole.USER);
  const normal = await create("normal", UserRole.USER);
  const reader = await create("reader", UserRole.ADMIN);
  await prisma.adminUserRole.create({
    data: { userId: reader.user.id, roleId: readerRole.id },
  });
  const finance = await create("finance", UserRole.ADMIN, "FINANCE");

  const reason = "Approved support access for account resolution";
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  const later = new Date(Date.now() + 30 * 86400000).toISOString();

  const mutate = (userId: string, method: "PUT" | "DELETE", bearer: string, body: unknown) =>
    fetch(`${origin}/api/admin/users/${userId}/subscription/support-entitlement`, {
      method,
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

  const detail = (userId: string, bearer = finance.bearer) =>
    fetch(`${origin}/api/admin/users/${userId}/subscription`, {
      headers: { authorization: `Bearer ${bearer}` },
    });

  async function assertEffective(
    fixture: Awaited<ReturnType<typeof create>>,
    tier: "FREE" | "PREMIUM" | "PREMIUM_PLUS",
  ) {
    assert.equal((await readEffectiveSubscriptionState(fixture.user.id))?.tier, tier);
    const appResponse = await fetch(`${origin}/api/subscription`, {
      headers: { authorization: `Bearer ${fixture.bearer}` },
    });
    assert.equal(appResponse.status, 200);
    const app = ((await appResponse.json()) as { data: { tier: string; entitlements: string[] } })
      .data;
    assert.equal(app.tier, tier);
    assert.deepEqual(app.entitlements, entitlementsForTier(tier));
    const admin = (
      (await (await detail(fixture.user.id)).json()) as {
        data: { subscription: { currentPlan: string } };
      }
    ).data.subscription;
    assert.equal(admin.currentPlan, app.tier);
  }

  const grantBody = {
    tier: "PREMIUM" as const,
    expiresAt: future,
    expectedUpdatedAt: null,
    reason,
    confirmed: true,
  };

  await t.test("normal users and read-only admins cannot mutate", async () => {
    assert.equal((await mutate(target.user.id, "PUT", normal.bearer, grantBody)).status, 403);
    assert.equal((await mutate(target.user.id, "PUT", reader.bearer, grantBody)).status, 403);
    assert.equal(
      await prisma.adminSupportEntitlement.count({ where: { userId: target.user.id } }),
      0,
    );
  });

  await t.test("grant requires reason, confirmation and a valid future expiry", async () => {
    for (const body of [
      { ...grantBody, reason: " " },
      { ...grantBody, confirmed: false },
      { tier: "PREMIUM", expiresAt: future, expectedUpdatedAt: null, reason },
      { ...grantBody, tier: "FREE" },
      { ...grantBody, expiresAt: null },
      { ...grantBody, expiresAt: "" },
      { ...grantBody, expiresAt: "not-a-date" },
      { tier: "PREMIUM", expectedUpdatedAt: null, reason, confirmed: true },
    ]) {
      assert.equal((await mutate(target.user.id, "PUT", finance.bearer, body)).status, 422);
    }

    assert.equal(
      (
        await mutate(target.user.id, "PUT", finance.bearer, {
          ...grantBody,
          expiresAt: new Date(Date.now() - 60000).toISOString(),
        })
      ).status,
      400,
    );
    for (const expiresAt of [null, new Date("invalid")]) {
      await assert.rejects(
        adminEntitlementOperationsService.upsert(
          { actorAdminId: finance.user.id, requestId: crypto.randomUUID() },
          target.user.id,
          { ...grantBody, expiresAt: expiresAt as unknown as Date },
        ),
      );
    }
    assert.equal(
      await prisma.adminSupportEntitlement.count({ where: { userId: target.user.id } }),
      0,
    );
  });

  await t.test(
    "authorized grant is audited and becomes canonical without provider mutation",
    async () => {
      const response = await mutate(target.user.id, "PUT", finance.bearer, grantBody);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: { supportEntitlement: { tier: string; status: string; updatedAt: string } };
      };
      assert.equal(payload.data.supportEntitlement.tier, "PREMIUM");
      assert.equal(payload.data.supportEntitlement.status, "ACTIVE");

      const subscription = (await (await detail(target.user.id)).json()) as {
        data: {
          subscription: {
            currentPlan: string;
            providerPlan: string;
            currentPlanSource: string;
            supportEntitlement: { status: string } | null;
          };
        };
      };
      assert.equal(subscription.data.subscription.currentPlan, "PREMIUM");
      assert.equal(subscription.data.subscription.providerPlan, "FREE");
      assert.equal(subscription.data.subscription.currentPlanSource, "ADMIN_SUPPORT");
      assert.equal(subscription.data.subscription.supportEntitlement?.status, "ACTIVE");

      const audit = await prisma.adminAuditEvent.findFirstOrThrow({
        where: {
          actorAdminId: finance.user.id,
          targetId: target.user.id,
          action: "admin.entitlements.support_upsert",
        },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(audit.reason, reason);
      assert.equal(audit.targetType, "user");
      assert.deepEqual(audit.beforeState, {
        source: "ADMIN_SUPPORT",
        supportStatus: "NONE",
      });
      assert.equal((audit.afterState as { supportTier?: string }).supportTier, "PREMIUM");
      assert.equal((audit.afterState as { supportStatus?: string }).supportStatus, "ACTIVE");
      assert.ok(audit.createdAt);
      assert.equal(audit.environment, "test");
      assert.equal((audit.afterState as { supportExpiry: string }).supportExpiry, future);
      assert.equal(audit.riskLevel, "HIGH");
      assert.ok(audit.requestId);
      assert.equal(audit.correlationId, audit.requestId);
      await assertEffective(target, "PREMIUM");
    },
  );

  await t.test("FREE to support PREMIUM_PLUS and revoke agree with the normal app", async () => {
    const fixture = await create("free-plus", UserRole.USER);
    assert.equal(
      (await mutate(fixture.user.id, "PUT", finance.bearer, { ...grantBody, tier: "PREMIUM_PLUS" }))
        .status,
      200,
    );
    await assertEffective(fixture, "PREMIUM_PLUS");
    const support = await prisma.adminSupportEntitlement.findUniqueOrThrow({
      where: { userId: fixture.user.id },
    });
    assert.equal(
      (
        await mutate(fixture.user.id, "DELETE", finance.bearer, {
          expectedUpdatedAt: support.updatedAt.toISOString(),
          reason,
          confirmed: true,
        })
      ).status,
      200,
    );
    await assertEffective(fixture, "FREE");
    assert.equal(await prisma.subscription.count({ where: { userId: fixture.user.id } }), 0);
    assert.equal(await prisma.payment.count({ where: { userId: fixture.user.id } }), 0);
  });

  await t.test(
    "expired or revoked support rights cannot be revoked and remain read-only",
    async () => {
      for (const status of ["EXPIRED", "REVOKED"] as const) {
        const fixture = await create(status.toLowerCase(), UserRole.USER);
        const row = await prisma.adminSupportEntitlement.create({
          data: {
            userId: fixture.user.id,
            tier: "PREMIUM_PLUS",
            expiresAt: status === "EXPIRED" ? new Date(Date.now() - 60000) : new Date(future),
            revokedAt: status === "REVOKED" ? new Date() : null,
          },
        });
        assert.equal(
          (
            await mutate(fixture.user.id, "DELETE", finance.bearer, {
              expectedUpdatedAt: row.updatedAt.toISOString(),
              reason,
              confirmed: true,
            })
          ).status,
          409,
        );
        await assertEffective(fixture, "FREE");
        const view = (
          (await (await detail(fixture.user.id)).json()) as {
            data: { subscription: { supportEntitlement: { status: string } } };
          }
        ).data.subscription;
        assert.equal(view.supportEntitlement.status, status);
        assert.deepEqual(
          await prisma.adminSupportEntitlement.findUniqueOrThrow({
            where: { userId: fixture.user.id },
          }),
          row,
        );
        assert.equal(
          await prisma.adminAuditEvent.count({ where: { targetId: fixture.user.id } }),
          0,
        );
      }
    },
  );

  await t.test(
    "unknown users and administrator targets fail without entitlement or audit",
    async () => {
      assert.equal(
        (await mutate(crypto.randomUUID(), "PUT", finance.bearer, grantBody)).status,
        404,
      );
      assert.equal((await mutate(finance.user.id, "PUT", finance.bearer, grantBody)).status, 403);
      assert.equal(
        await prisma.adminSupportEntitlement.count({ where: { userId: finance.user.id } }),
        0,
      );
    },
  );

  await t.test("stale state and duplicate updates fail closed", async () => {
    const current = await prisma.adminSupportEntitlement.findUniqueOrThrow({
      where: { userId: target.user.id },
    });
    const oldUpdatedAt = current.updatedAt.toISOString();

    const first = await mutate(target.user.id, "PUT", finance.bearer, {
      tier: "PREMIUM_PLUS",
      expiresAt: later,
      expectedUpdatedAt: oldUpdatedAt,
      reason,
      confirmed: true,
    });
    assert.equal(first.status, 200);

    assert.equal(
      (
        await mutate(target.user.id, "PUT", finance.bearer, {
          tier: "PREMIUM",
          expiresAt: future,
          expectedUpdatedAt: oldUpdatedAt,
          reason,
          confirmed: true,
        })
      ).status,
      409,
    );

    const latest = await prisma.adminSupportEntitlement.findUniqueOrThrow({
      where: { userId: target.user.id },
    });
    assert.equal(
      (
        await mutate(target.user.id, "PUT", finance.bearer, {
          tier: latest.tier,
          expiresAt: latest.expiresAt?.toISOString() ?? null,
          expectedUpdatedAt: latest.updatedAt.toISOString(),
          reason,
          confirmed: true,
        })
      ).status,
      409,
    );
  });

  await t.test("concurrent duplicate grant produces one mutation and one audit", async () => {
    const before = await prisma.adminAuditEvent.count({
      where: {
        actorAdminId: finance.user.id,
        targetId: duplicateTarget.user.id,
        action: "admin.entitlements.support_upsert",
      },
    });
    const results = await Promise.all([
      mutate(duplicateTarget.user.id, "PUT", finance.bearer, grantBody),
      mutate(duplicateTarget.user.id, "PUT", finance.bearer, grantBody),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(
      await prisma.adminAuditEvent.count({
        where: {
          actorAdminId: finance.user.id,
          targetId: duplicateTarget.user.id,
          action: "admin.entitlements.support_upsert",
        },
      }),
      before + 1,
    );
  });

  await t.test("IYZICO subscription is never mutated by support operations", async () => {
    await prisma.user.update({
      where: { id: iyzicoTarget.user.id },
      data: { subscriptionTier: "PREMIUM" },
    });
    const provider = await prisma.subscription.create({
      data: {
        userId: iyzicoTarget.user.id,
        tier: "PREMIUM",
        status: "ACTIVE",
        provider: "IYZICO",
        providerRef: "B2-IYZICO-PROVIDER-SENTINEL",
        providerSubscriptionRef: "B2-IYZICO-SUBSCRIPTION-SENTINEL",
        currentPeriodStart: new Date(Date.now() - 86400000),
        currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
      },
    });
    const before = await prisma.subscription.findUniqueOrThrow({ where: { id: provider.id } });
    const payment = await prisma.payment.create({
      data: {
        userId: iyzicoTarget.user.id,
        subscriptionId: provider.id,
        status: "SUCCEEDED",
        amountMinor: 10000,
        providerPaymentId: "B2-PAYMENT-SENTINEL",
        rawStatus: "success",
      },
    });
    const userBeforeGrant = await prisma.user.findUniqueOrThrow({
      where: { id: iyzicoTarget.user.id },
      select: { subscriptionTier: true, updatedAt: true },
    });

    assert.equal(
      (
        await mutate(iyzicoTarget.user.id, "PUT", finance.bearer, {
          ...grantBody,
          tier: "PREMIUM_PLUS",
        })
      ).status,
      200,
    );
    assert.deepEqual(
      await prisma.user.findUniqueOrThrow({
        where: { id: iyzicoTarget.user.id },
        select: { subscriptionTier: true, updatedAt: true },
      }),
      userBeforeGrant,
    );
    await assertEffective(iyzicoTarget, "PREMIUM_PLUS");
    const support = await prisma.adminSupportEntitlement.findUniqueOrThrow({
      where: { userId: iyzicoTarget.user.id },
    });
    assert.equal(
      (
        await mutate(iyzicoTarget.user.id, "DELETE", finance.bearer, {
          expectedUpdatedAt: support.updatedAt.toISOString(),
          reason,
          confirmed: true,
        })
      ).status,
      200,
    );

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: provider.id } });
    assert.deepEqual(after, before);

    const view = (await (await detail(iyzicoTarget.user.id)).json()) as {
      data: { subscription: { currentPlan: string; currentPlanSource: string } };
    };
    assert.equal(view.data.subscription.currentPlan, "PREMIUM");
    assert.equal(view.data.subscription.currentPlanSource, "IYZICO_SUBSCRIPTION");
    await assertEffective(iyzicoTarget, "PREMIUM");

    const revoked = await prisma.adminSupportEntitlement.findUniqueOrThrow({
      where: { userId: iyzicoTarget.user.id },
    });
    assert.equal(
      (
        await mutate(iyzicoTarget.user.id, "PUT", finance.bearer, {
          ...grantBody,
          expectedUpdatedAt: revoked.updatedAt.toISOString(),
        })
      ).status,
      200,
    );
    await assertEffective(iyzicoTarget, "PREMIUM");
    const equalTier = await prisma.adminSupportEntitlement.findUniqueOrThrow({
      where: { userId: iyzicoTarget.user.id },
    });
    assert.equal(
      (
        await mutate(iyzicoTarget.user.id, "DELETE", finance.bearer, {
          expectedUpdatedAt: equalTier.updatedAt.toISOString(),
          reason,
          confirmed: true,
        })
      ).status,
      200,
    );
    await assertEffective(iyzicoTarget, "PREMIUM");
    assert.deepEqual(
      await prisma.subscription.findUniqueOrThrow({ where: { id: provider.id } }),
      before,
    );
    assert.deepEqual(
      await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      payment,
    );
  });

  await t.test("Google Play entitlement is never mutated by support operations", async () => {
    const purchaseTokenHash = crypto
      .createHash("sha256")
      .update("B2-PLAY-TOKEN-SENTINEL")
      .digest("hex");
    await googlePlayEntitlementsRepository.grantVerified({
      userId: playTarget.user.id,
      purchaseTokenHash,
      linkedPurchaseTokenHash: null,
      productId: "B2-PLAY-PRODUCT-SENTINEL",
      tier: "PREMIUM",
      orderId: "B2-PLAY-ORDER-SENTINEL",
      rawState: "SUBSCRIPTION_STATE_ACTIVE",
      startedAt: new Date(Date.now() - 86400000),
      expiresAt: new Date(Date.now() + 20 * 86400000),
    });
    const before = await googlePlayEntitlementsRepository.findByTokenHash(purchaseTokenHash);
    assert.ok(before);

    assert.equal(
      (
        await mutate(playTarget.user.id, "PUT", finance.bearer, {
          ...grantBody,
          tier: "PREMIUM_PLUS",
        })
      ).status,
      200,
    );
    await assertEffective(playTarget, "PREMIUM_PLUS");
    const support = await prisma.adminSupportEntitlement.findUniqueOrThrow({
      where: { userId: playTarget.user.id },
    });
    assert.equal(
      (
        await mutate(playTarget.user.id, "DELETE", finance.bearer, {
          expectedUpdatedAt: support.updatedAt.toISOString(),
          reason,
          confirmed: true,
        })
      ).status,
      200,
    );

    const after = await googlePlayEntitlementsRepository.findByTokenHash(purchaseTokenHash);
    assert.deepEqual(after, before);
    const view = (await (await detail(playTarget.user.id)).json()) as {
      data: { subscription: { currentPlan: string; currentPlanSource: string } };
    };
    assert.equal(view.data.subscription.currentPlan, "PREMIUM");
    assert.equal(view.data.subscription.currentPlanSource, "GOOGLE_PLAY_ENTITLEMENT");
    await assertEffective(playTarget, "PREMIUM");
    assert.equal(await prisma.payment.count({ where: { userId: playTarget.user.id } }), 0);
  });

  await t.test("revoke requires current state and writes exact before/after audit", async () => {
    const current = await prisma.adminSupportEntitlement.findUniqueOrThrow({
      where: { userId: target.user.id },
    });
    assert.equal(
      (
        await mutate(target.user.id, "DELETE", reader.bearer, {
          expectedUpdatedAt: current.updatedAt.toISOString(),
          reason,
          confirmed: true,
        })
      ).status,
      403,
    );
    const response = await mutate(target.user.id, "DELETE", finance.bearer, {
      expectedUpdatedAt: current.updatedAt.toISOString(),
      reason,
      confirmed: true,
    });
    assert.equal(response.status, 200);
    await assertEffective(target, "FREE");

    const audit = await prisma.adminAuditEvent.findFirstOrThrow({
      where: {
        actorAdminId: finance.user.id,
        targetId: target.user.id,
        action: "admin.entitlements.support_revoke",
      },
      orderBy: { createdAt: "desc" },
    });
    assert.equal((audit.beforeState as { supportStatus?: string }).supportStatus, "ACTIVE");
    assert.equal((audit.afterState as { supportStatus?: string }).supportStatus, "REVOKED");
    assert.equal(
      (
        await mutate(target.user.id, "DELETE", finance.bearer, {
          expectedUpdatedAt: current.updatedAt.toISOString(),
          reason,
          confirmed: true,
        })
      ).status,
      409,
    );
    for (const bearer of [normal.bearer, reader.bearer]) {
      assert.equal(
        (
          await mutate(target.user.id, "DELETE", bearer, {
            expectedUpdatedAt: current.updatedAt.toISOString(),
            reason,
            confirmed: true,
          })
        ).status,
        403,
      );
    }
  });

  await t.test("audit failure rolls back support entitlement mutation", async () => {
    const badContext = {
      actorAdminId: finance.user.id,
      requestId: null as unknown as string,
    };
    await assert.rejects(
      adminEntitlementOperationsService.upsert(badContext, rollbackTarget.user.id, {
        tier: "PREMIUM",
        expiresAt: new Date(Date.now() + 86400000),
        expectedUpdatedAt: null,
        reason,
      }),
    );
    assert.equal(
      await prisma.adminSupportEntitlement.count({
        where: { userId: rollbackTarget.user.id },
      }),
      0,
    );
    assert.equal(
      (await mutate(rollbackTarget.user.id, "PUT", finance.bearer, grantBody)).status,
      200,
    );
    const granted = await prisma.adminSupportEntitlement.findUniqueOrThrow({
      where: { userId: rollbackTarget.user.id },
    });
    await assert.rejects(
      adminEntitlementOperationsService.revoke(
        badContext,
        rollbackTarget.user.id,
        granted.updatedAt.toISOString(),
        reason,
      ),
    );
    assert.deepEqual(
      await prisma.adminSupportEntitlement.findUniqueOrThrow({
        where: { userId: rollbackTarget.user.id },
      }),
      granted,
    );
  });

  await t.test("responses and audit exclude provider, auth and health secrets", async () => {
    await prisma.userProfile.create({
      data: {
        userId: duplicateTarget.user.id,
        dateOfBirth: new Date("1990-01-01"),
        gender: "OTHER",
        heightCm: 170,
        currentWeightKg: 70,
        targetWeightKg: 65,
        activityLevel: "SEDENTARY",
        healthConditions: ["B2-HEALTH-SENTINEL"],
        allergies: ["B2-ALLERGY-SENTINEL"],
        dietaryPreference: "OMNIVORE",
        dailyWaterGoalMl: 2000,
      },
    });
    const response = await detail(duplicateTarget.user.id);
    assert.equal(response.status, 200);
    const body = JSON.stringify(await response.json());
    assert.doesNotMatch(
      body,
      /passwordHash|purchaseToken|tokenHash|providerRef|providerSubscriptionRef|card|secret|healthConditions|allergies|B2-.*SENTINEL/i,
    );

    const audits = await prisma.adminAuditEvent.findMany({
      where: { targetId: duplicateTarget.user.id },
    });
    assert.doesNotMatch(
      JSON.stringify(audits),
      /password|purchaseToken|tokenHash|providerRef|card|secret|health|allerg/i,
    );
  });

  await t.test("production environment fails closed", async () => {
    const previous = env.DIEWISH_ENVIRONMENT;
    try {
      env.DIEWISH_ENVIRONMENT = "production";
      assert.equal(
        (await mutate(duplicateTarget.user.id, "PUT", finance.bearer, grantBody)).status,
        403,
      );
    } finally {
      env.DIEWISH_ENVIRONMENT = previous;
    }
  });
});
