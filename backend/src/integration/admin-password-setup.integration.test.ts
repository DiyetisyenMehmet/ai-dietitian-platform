import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { bootstrapAdminFoundation } from "../modules/admin/admin.bootstrap";
import { adminAuthService } from "../modules/admin/admin-auth.service";
import { adminGovernanceService } from "../modules/admin/admin-governance.service";
import { adminPasswordIdentityProvider as provider } from "../modules/admin/admin-password-identity.provider";
import { firebaseAuthProvider } from "../modules/identity/firebase-auth.provider";
import { resolveAdminAccess } from "../modules/admin/admin-rbac.repository";
import { verifyPassword } from "../utils/password";
import { ApiError } from "../utils/api-error";

const context = { userAgent: "admin-password-regression", ipAddress: "127.0.0.1" };
const password = "SupportSetupPass123!";

test("Firebase-backed Admin invitation/reset security contract", async (t) => {
  await bootstrapAdminFoundation();
  const userIds: string[] = [];
  const original = { ...provider };
  const originalIdentity = firebaseAuthProvider.verifyIdToken;
  const codes = new Map<string, string>();
  const passwords = new Map<string, string>();
  let confirmations = 0;
  let sentContext = "";
  let sentEmail = "";
  provider.createUser = async (email, value) => {
    passwords.set(email, value);
    return { email, idToken: "test-identity" };
  };
  provider.deleteUser = async () => undefined;
  provider.sendPasswordReset = async (email, kind) => {
    sentEmail = email;
    sentContext = kind ?? "reset";
  };
  provider.verifyPasswordReset = async (code) => {
    const email = codes.get(code);
    if (!email) throw new ApiError(400, "Invalid link", { code: "ADMIN_RESET_LINK_INVALID" });
    return { email, requestType: "PASSWORD_RESET" };
  };
  provider.confirmPasswordReset = async (code, value) => {
    const result = await provider.verifyPasswordReset(code);
    confirmations += 1;
    passwords.set(result.email!, value);
    codes.delete(code);
    return result;
  };
  provider.signIn = async (email, value) => {
    if (passwords.get(email) !== value) throw new ApiError(401, "Invalid credentials");
    return { idToken: email, email };
  };
  firebaseAuthProvider.verifyIdToken = async (email) => ({
    uid: email,
    displayName: null,
    email,
    emailVerified: true,
    phoneNumber: null,
    providers: ["password"],
  });
  t.after(async () => {
    Object.assign(provider, original);
    firebaseAuthProvider.verifyIdToken = originalIdentity;
    await prisma.adminAuditEvent.deleteMany({
      where: { OR: [{ actorAdminId: { in: userIds } }, { targetId: { in: userIds } }] },
    });
    await prisma.adminInvitation.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { invitedByAdminId: { in: userIds } }] },
    });
    await prisma.adminUserRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });
  const owner = await prisma.user.create({
    data: {
      email: `admin2.owner.${crypto.randomUUID()}@example.com`,
      role: UserRole.ADMIN,
      passwordHash: "fixture",
    },
  });
  userIds.push(owner.id);
  const superRole = await prisma.adminRole.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  await prisma.adminUserRole.create({ data: { userId: owner.id, roleId: superRole.id } });

  async function invite() {
    const email = `admin2.support.${crypto.randomUUID()}@example.com`;
    const invitation = await adminGovernanceService.inviteStaff(
      owner.id,
      {
        email,
        roleKeys: ["SUPPORT"],
        fullName: "Synthetic Support",
        reason: "Admin2 isolated regression",
      },
      { correlationId: "admin2-regression", requestId: "admin2-regression" },
    );
    userIds.push(invitation.userId);
    const code = crypto.randomUUID();
    codes.set(code, email);
    return { ...invitation, code };
  }

  await t.test(
    "SUPPORT invitation activates only through backend; preserves roles, audits and revokes sessions",
    async () => {
      const invitation = await invite();
      assert.equal(sentContext, "invitation");
      assert.equal(sentEmail, invitation.email);
      const before = await prisma.user.findUniqueOrThrow({ where: { id: invitation.userId } });
      assert.equal(before.isActive, false);
      assert.equal(before.role, UserRole.ADMIN);
      assert.deepEqual(await adminAuthService.verifyPasswordReset(invitation.code), {
        context: "invitation",
      });
      const oldSession = await prisma.refreshToken.create({
        data: {
          userId: before.id,
          tokenHash: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      const result = await adminAuthService.resetPassword(invitation.code, password, context);
      assert.equal(result.context, "invitation");
      const user = await prisma.user.findUniqueOrThrow({ where: { id: before.id } });
      assert.equal(user.isActive, true);
      assert.ok(user.emailVerifiedAt);
      assert.equal(user.role, UserRole.ADMIN);
      assert.ok(await verifyPassword(password, user.passwordHash));
      const accepted = await prisma.adminInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });
      assert.ok(accepted.acceptedAt);
      assert.equal(accepted.revokedAt, null);
      assert.ok(
        (await prisma.refreshToken.findUniqueOrThrow({ where: { id: oldSession.id } })).revokedAt,
      );
      const access = await resolveAdminAccess(user.id);
      assert.deepEqual(access?.roles, ["SUPPORT"]);
      assert.ok(!access?.permissions.includes("entitlements.grant"));
      assert.ok(!access?.permissions.includes("entitlements.revoke"));
      assert.equal(
        (await adminAuthService.loginWithEmail(user.email, password, context)).user.role,
        UserRole.ADMIN,
      );
      const audit = await prisma.adminAuditEvent.findMany({ where: { targetId: user.id } });
      assert.ok(audit.some((a) => a.action === "admin.staff.invite_create"));
      assert.ok(audit.some((a) => a.action === "admin.staff.invite_accept"));
      assert.ok(!JSON.stringify(audit).includes(password));
      assert.ok(!JSON.stringify(audit).includes(invitation.code));
      await assert.rejects(adminAuthService.resetPassword(invitation.code, password, context));
      const resetCode = crypto.randomUUID();
      codes.set(resetCode, user.email);
      assert.deepEqual(await adminAuthService.verifyPasswordReset(resetCode), { context: "reset" });
      assert.equal(
        (await adminAuthService.resetPassword(resetCode, "SupportResetPass456!", context)).context,
        "reset",
      );
      assert.equal(
        (await adminAuthService.loginWithEmail(user.email, "SupportResetPass456!", context)).user
          .role,
        UserRole.ADMIN,
      );
      assert.deepEqual((await resolveAdminAccess(user.id))?.roles, ["SUPPORT"]);
    },
  );

  await t.test(
    "expiration during provider confirmation cannot activate an Admin",
    async (subtest) => {
      const invitation = await invite();
      const now = Date.now();
      await prisma.adminInvitation.update({
        where: { id: invitation.id },
        data: { expiresAt: new Date(now + 10_000) },
      });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: invitation.userId } });
      const confirm = provider.confirmPasswordReset;
      subtest.mock.timers.enable({ apis: ["Date"], now });
      provider.confirmPasswordReset = async (code, value) => {
        const result = await confirm(code, value);
        subtest.mock.timers.tick(10_001);
        return result;
      };
      try {
        await assert.rejects(adminAuthService.resetPassword(invitation.code, password, context));
        const after = await prisma.user.findUniqueOrThrow({ where: { id: invitation.userId } });
        assert.equal(after.isActive, false);
        assert.equal(after.passwordHash, before.passwordHash);
        assert.equal(
          (await prisma.adminInvitation.findUniqueOrThrow({ where: { id: invitation.id } }))
            .acceptedAt,
          null,
        );
        assert.equal(
          await prisma.adminAuditEvent.count({
            where: { targetId: invitation.userId, action: "admin.staff.invite_accept" },
          }),
          0,
        );
        assert.equal(await resolveAdminAccess(invitation.userId), null);
      } finally {
        provider.confirmPasswordReset = confirm;
        subtest.mock.timers.reset();
      }
    },
  );

  for (const kind of [
    "expired",
    "revoked",
    "email-mismatch",
    "no-invitation",
    "no-role",
    "invalid-code",
  ] as const) {
    await t.test(
      `${kind} is rejected before Firebase password mutation and activation`,
      async () => {
        const invitation = await invite();
        if (kind === "expired")
          await prisma.adminInvitation.update({
            where: { id: invitation.id },
            data: { expiresAt: new Date(0) },
          });
        if (kind === "revoked")
          await prisma.adminInvitation.update({
            where: { id: invitation.id },
            data: { revokedAt: new Date() },
          });
        if (kind === "email-mismatch")
          await prisma.adminInvitation.update({
            where: { id: invitation.id },
            data: { email: "other@example.com" },
          });
        if (kind === "no-invitation")
          await prisma.adminInvitation.delete({ where: { id: invitation.id } });
        if (kind === "no-role")
          await prisma.adminUserRole.deleteMany({ where: { userId: invitation.userId } });
        if (kind === "invalid-code") codes.delete(invitation.code);
        const before = await prisma.user.findUniqueOrThrow({ where: { id: invitation.userId } });
        const count = confirmations;
        await assert.rejects(adminAuthService.verifyPasswordReset(invitation.code));
        await assert.rejects(adminAuthService.resetPassword(invitation.code, password, context));
        assert.equal(confirmations, count);
        assert.notEqual(passwords.get(invitation.email), password);
        const after = await prisma.user.findUniqueOrThrow({ where: { id: invitation.userId } });
        assert.equal(after.isActive, false);
        assert.equal(after.passwordHash, before.passwordHash);
        if (kind !== "no-invitation")
          assert.equal(
            (await prisma.adminInvitation.findUniqueOrThrow({ where: { id: invitation.id } }))
              .acceptedAt,
            null,
          );
      },
    );
  }
  await t.test(
    "normal USER cannot mutate password or gain Admin membership through Admin reset",
    async () => {
      const user = await prisma.user.create({
        data: {
          email: `admin2.user.${crypto.randomUUID()}@example.com`,
          role: UserRole.USER,
          passwordHash: "fixture",
        },
      });
      userIds.push(user.id);
      const code = crypto.randomUUID();
      codes.set(code, user.email);
      const count = confirmations;
      await assert.rejects(adminAuthService.resetPassword(code, password, context));
      assert.equal(confirmations, count);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role,
        UserRole.USER,
      );
      assert.equal(await prisma.adminUserRole.count({ where: { userId: user.id } }), 0);
    },
  );
  await t.test(
    "pending invitation can request a new Firebase code after a hosted-handler bypass",
    async () => {
      const invitation = await invite();
      sentContext = "";
      await adminAuthService.requestPasswordReset(invitation.email, context);
      assert.equal(sentContext, "invitation");
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: invitation.userId } })).isActive,
        false,
      );
    },
  );
});
