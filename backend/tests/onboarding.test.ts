import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, beforeEach, test } from "node:test";

import { prisma } from "../src/lib/prisma";
import { onboardingSchema } from "../src/modules/onboarding/onboarding.schemas";
import { onboardingService } from "../src/modules/onboarding/onboarding.service";
import { hashPassword } from "../src/utils/password";

const validInput = {
  fullName: "Test User",
  dateOfBirth: "1990-05-10",
  gender: "PREFER_NOT_TO_SAY" as const,
  heightCm: 175,
  currentWeightKg: 82,
  targetWeightKg: 74,
  activityLevel: "MODERATE" as const,
  healthConditions: [" hypertension ", "hypertension"],
  allergies: ["peanut"],
  dietaryPreference: "MEDITERRANEAN" as const,
  dailyWaterGoalMl: 2500,
};

async function clean(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.user.deleteMany();
}

async function createUser(email: string): Promise<string> {
  const row = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("StrongPass123"),
    },
  });
  return row.id;
}

beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test("onboarding schema accepts valid input, trims and deduplicates list fields", () => {
  const parsed = onboardingSchema.parse(validInput);
  assert.deepEqual(parsed.healthConditions, ["hypertension"]);
  assert.deepEqual(parsed.allergies, ["peanut"]);
});

test("onboarding schema rejects invalid anthropometric and date input", () => {
  assert.equal(
    onboardingSchema.safeParse({ ...validInput, heightCm: 50 }).success,
    false,
  );
  assert.equal(
    onboardingSchema.safeParse({ ...validInput, currentWeightKg: 500 }).success,
    false,
  );
  assert.equal(
    onboardingSchema.safeParse({ ...validInput, dateOfBirth: "2999-01-01" }).success,
    false,
  );
});

test("onboarding completion persists profile and user gate atomically", async () => {
  const userId = await createUser("onboarding@example.com");
  const result = await onboardingService.completeOnboarding(userId, validInput);

  assert.equal(result.onboardingCompleted, true);
  assert.equal(result.fullName, validInput.fullName);

  const [user, profile] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.userProfile.findUniqueOrThrow({ where: { userId } }),
  ]);
  assert.equal(user.onboardingCompleted, true);
  assert.equal(user.fullName, validInput.fullName);
  assert.equal(profile.currentWeightKg, validInput.currentWeightKg);
});

test("repeated onboarding updates the existing profile instead of creating duplicates", async () => {
  const userId = await createUser("onboarding-repeat@example.com");
  await onboardingService.completeOnboarding(userId, validInput);
  await onboardingService.completeOnboarding(userId, {
    ...validInput,
    fullName: "Updated User",
    currentWeightKg: 79,
    dailyWaterGoalMl: 2800,
  });

  assert.equal(await prisma.userProfile.count({ where: { userId } }), 1);
  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(profile.currentWeightKg, 79);
  assert.equal(profile.dailyWaterGoalMl, 2800);
  assert.equal(user.fullName, "Updated User");
});

test("concurrent onboarding retries converge to one profile row", async () => {
  const userId = await createUser("onboarding-race@example.com");

  const results = await Promise.allSettled([
    onboardingService.completeOnboarding(userId, validInput),
    onboardingService.completeOnboarding(userId, {
      ...validInput,
      currentWeightKg: 80,
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(await prisma.userProfile.count({ where: { userId } }), 1);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(user.onboardingCompleted, true);
});

test("failed onboarding transaction leaves no orphan profile", async () => {
  const missingUserId = crypto.randomUUID();
  await assert.rejects(onboardingService.completeOnboarding(missingUserId, validInput));
  assert.equal(await prisma.userProfile.count({ where: { userId: missingUserId } }), 0);
});
