import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { prisma } from "../src/lib/prisma";
import { onboardingSchema } from "../src/modules/onboarding/onboarding.schemas";
import { onboardingService } from "../src/modules/onboarding/onboarding.service";

async function clean(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
}

async function user(email: string): Promise<string> {
  const row = await prisma.user.create({ data: { email, passwordHash: "unused" } });
  return row.id;
}

function validInput() {
  return {
    fullName: "Onboarding User",
    dateOfBirth: "1995-05-12",
    gender: "FEMALE" as const,
    heightCm: 168,
    currentWeightKg: 72,
    targetWeightKg: 65,
    activityLevel: "MODERATE" as const,
    healthConditions: ["Hypertension", "Hypertension"],
    allergies: ["Peanut"],
    dietaryPreference: "MEDITERRANEAN" as const,
    dailyWaterGoalMl: 2200,
  };
}

beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test("valid onboarding persists profile and completion flag atomically", async () => {
  const userId = await user("onboarding-valid@example.com");
  const input = onboardingSchema.parse(validInput());
  const result = await onboardingService.completeOnboarding(userId, input);

  assert.equal(result.onboardingCompleted, true);
  assert.equal(result.profile.dateOfBirth, "1995-05-12");
  assert.deepEqual(result.profile.healthConditions, ["Hypertension"]);

  const stored = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { profile: true },
  });
  assert.equal(stored.onboardingCompleted, true);
  assert.ok(stored.profile);
  assert.equal(stored.fullName, "Onboarding User");
});

test("invalid onboarding payload is rejected by the schema", () => {
  const parsed = onboardingSchema.safeParse({
    ...validInput(),
    dateOfBirth: "2999-01-01",
    heightCm: 10,
    dailyWaterGoalMl: 10,
  });
  assert.equal(parsed.success, false);
});

test("repeat onboarding updates the same profile instead of creating duplicates", async () => {
  const userId = await user("onboarding-repeat@example.com");
  await onboardingService.completeOnboarding(userId, onboardingSchema.parse(validInput()));
  await onboardingService.completeOnboarding(
    userId,
    onboardingSchema.parse({
      ...validInput(),
      fullName: "Updated User",
      currentWeightKg: 69,
      allergies: ["Peanut", "Lactose"],
    }),
  );

  assert.equal(await prisma.userProfile.count({ where: { userId } }), 1);
  const stored = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { profile: true },
  });
  assert.equal(stored.fullName, "Updated User");
  assert.equal(stored.profile?.currentWeightKg, 69);
  assert.deepEqual(stored.profile?.allergies, ["Peanut", "Lactose"]);
});

test("transaction rollback prevents half-completed onboarding when user update fails", async () => {
  const missingUserId = "00000000-0000-4000-8000-000000000001";
  await assert.rejects(
    onboardingService.completeOnboarding(missingUserId, onboardingSchema.parse(validInput())),
  );
  assert.equal(await prisma.userProfile.count({ where: { userId: missingUserId } }), 0);
});
