import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { validate } from "./validate";
import { ApiError } from "../utils/api-error";
import { onboardingSchema } from "../modules/onboarding/onboarding.schemas";
import { dashboardCardPreferencesSchema } from "../modules/account/account.schemas";
import {
  waterReminderScheduleSchema,
  notificationInboxQuerySchema,
} from "../modules/notifications/notification.schemas";
import { adminStaffUpdateSchema } from "../modules/admin/admin-access.schemas";
import {
  adminInvitationCreateSchema,
  adminRoleCreateSchema,
  adminRoleUpdateSchema,
} from "../modules/admin/admin-governance.schemas";
import { loginSchema, registerSchema } from "../modules/auth/auth.schemas";

function oversized(size: number): unknown[] {
  const input = Array(size);
  Object.defineProperty(input, 0, {
    get() {
      throw new Error("oversized element was inspected");
    },
  });
  return input;
}
function earlyReject(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, "too_big");
  }
}

test("health lists retain 30-entry bounds, defaults, trimming and deduplication", () => {
  const list = onboardingSchema.shape.healthConditions;
  assert.deepEqual(list.parse(undefined), []);
  assert.deepEqual(list.parse([" Asthma ", "Asthma"]), ["Asthma"]);
  assert.equal(list.parse(Array.from({ length: 30 }, (_, i) => `Condition ${i}`)).length, 30);
  for (const field of ["healthConditions", "allergies"] as const) {
    earlyReject(onboardingSchema.shape[field], oversized(31));
    earlyReject(onboardingSchema.shape[field], oversized(100_000));
    assert.equal(onboardingSchema.shape[field].safeParse([123]).success, false);
  }
});
test("onboarding medical bounds and unknown account fields retain their contract", () => {
  const input = {
    fullName: "Synthetic Patient",
    dateOfBirth: "1990-01-01",
    gender: "OTHER",
    heightCm: 170,
    currentWeightKg: 72,
    targetWeightKg: 70,
    activityLevel: "MODERATE",
    healthConditions: [],
    allergies: [],
    dietaryPreference: "OMNIVORE",
    dailyWaterGoalMl: 2000,
  };
  const parsed = onboardingSchema.parse({ ...input, userId: "different-account", isAdmin: true });
  assert.equal("userId" in parsed, false);
  assert.equal("isAdmin" in parsed, false);
  for (const value of [
    { currentWeightKg: 401 },
    { heightCm: 79 },
    { dailyWaterGoalMl: 6001 },
    { dateOfBirth: "2999-01-01" },
  ]) {
    assert.equal(onboardingSchema.safeParse({ ...input, ...value }).success, false);
  }
});
test("every dashboard collection rejects above its existing bound before element access", () => {
  for (const [field, limit] of [
    ["order", 32],
    ["hidden", 32],
    ["quickActionOrder", 16],
    ["hiddenQuickActionIds", 16],
  ] as const) {
    const schema = dashboardCardPreferencesSchema.shape[field];
    assert.equal(schema.safeParse(Array(limit).fill("water")).success, true);
    earlyReject(schema, oversized(limit + 1));
  }
});
test("notification nested water lists, fixed week and inbox retain their bounds", () => {
  const times = waterReminderScheduleSchema.shape.dailyTimes;
  assert.equal(
    times.safeParse(["00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00"])
      .success,
    true,
  );
  earlyReject(times, oversized(9));
  earlyReject(waterReminderScheduleSchema.shape.days, oversized(8));
  const week = Array.from({ length: 7 }, (_, day) => ({ day, enabled: true, times: ["08:00"] }));
  const schedule = { version: 1, mode: "custom", dailyTimes: [], days: week };
  assert.equal(waterReminderScheduleSchema.safeParse(schedule).success, true);
  week[0].times = oversized(9) as string[];
  const nested = waterReminderScheduleSchema.safeParse(schedule);
  assert.equal(nested.success, false);
  if (!nested.success) assert.deepEqual(nested.error.issues[0].path, ["days", 0, "times"]);
  const id = "12345678-1234-4234-8234-123456789abc";
  assert.equal(
    notificationInboxQuerySchema.safeParse({ nativeServerIds: Array(100).fill(id).join(",") })
      .success,
    true,
  );
  assert.equal(
    notificationInboxQuerySchema.safeParse({ nativeServerIds: Array(101).fill(id).join(",") })
      .success,
    false,
  );
});
test("unchanged Admin schemas reject oversized roles and permissions before traversal", () => {
  for (const [schema, limit] of [
    [adminStaffUpdateSchema.shape.roleKeys, 12],
    [adminInvitationCreateSchema.shape.roleKeys, 12],
    [adminRoleCreateSchema.shape.permissionKeys, 64],
    [adminRoleUpdateSchema.shape.permissionKeys, 64],
  ] as const) {
    earlyReject(schema, oversized(limit + 1));
  }
});
test("set and map explicit bounds use the same upstream early rejection", () => {
  let visits = 0;
  const item = z.unknown().transform(() => {
    visits++;
    return "x";
  });
  earlyReject(z.set(item).max(1), new Set([1, 2]));
  earlyReject(
    z.map(item, item).max(1),
    new Map([
      [1, 1],
      [2, 2],
    ]),
  );
  assert.equal(visits, 0);
});
test("auth policy, canonical email and unknown-key stripping remain intact", () => {
  assert.deepEqual(
    loginSchema.parse({ email: " User@Example.com ", password: "secret", userId: "other" }),
    { email: "user@example.com", password: "secret" },
  );
  for (const password of ["short", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere"]) {
    assert.equal(registerSchema.safeParse({ email: "user@example.com", password }).success, false);
  }
});
test("validation keeps 422 field/message envelope and does not accept invalid fields", () => {
  const req = { body: { email: "invalid", password: "" } } as Request;
  let rejected: unknown;
  validate({ body: loginSchema })(
    req,
    {} as Response,
    ((error: unknown) => {
      rejected = error;
    }) as NextFunction,
  );
  assert.ok(rejected instanceof ApiError);
  assert.equal(rejected.statusCode, 422);
  assert.equal(rejected.code, "UNPROCESSABLE_ENTITY");
  assert.deepEqual(
    (rejected.details as { field: string }[]).map((x) => x.field),
    ["email", "password"],
  );
});
test("real app rejects JSON and form bodies over 1 MiB before auth/health routes", async () => {
  const { createApp } = await import("../app");
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    for (const [path, type, body] of [
      [
        "/api/auth/login",
        "application/json",
        JSON.stringify({ password: "x".repeat(1024 * 1024) }),
      ],
      [
        "/api/onboarding",
        "application/x-www-form-urlencoded",
        "healthConditions=" + "x".repeat(1024 * 1024),
      ],
    ]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "POST",
        headers: { "Content-Type": type },
        body,
      });
      assert.equal(response.status, 413);
      const data = (await response.json()) as {
        success: boolean;
        error: { code: string; message: string };
      };
      assert.equal(data.success, false);
      assert.equal(data.error.code, "PAYLOAD_TOO_LARGE");
      assert.equal(data.error.message, "Request body is too large.");
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
