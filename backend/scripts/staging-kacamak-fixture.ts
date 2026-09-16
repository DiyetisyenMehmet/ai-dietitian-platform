import fs from "node:fs/promises";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "../src/lib/prisma";

const PASSWORD = "KacamakStage123!";

interface FixtureAccount {
  email: string;
  password: string;
  planId: string;
}

interface FixtureFile {
  premiumPlus: FixtureAccount;
  free: FixtureAccount;
  downgraded: FixtureAccount & { deviationId: string };
}

function istanbulYmd(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function content() {
  const longFoodName = "Domates, salatalık, maydanoz ve mevsim yeşillikleri ile hazırlanmış çok uzun isimli salata";
  const cycle = Array.from({ length: 7 }, (_, index) => ({
    dayLabel: `${index + 1}. Gün`,
    meals: [
      {
        name: "Kahvaltı",
        time: "08:00",
        foods: [
          { name: "Tam buğday ekmeği", portion: "100 g", calories: 200 },
          { name: longFoodName, portion: "1 porsiyon", calories: 80 },
        ],
        calories: 280,
        proteinGrams: 12,
        carbsGrams: 48,
        fatGrams: 6,
        explanation: "Staging Kaçamak kabul öğünü",
      },
      {
        name: "Öğle Yemeği",
        time: "13:00",
        foods: [{ name: "Yoğurt", portion: "200 g", calories: 120 }],
        calories: 120,
        proteinGrams: 8,
        carbsGrams: 10,
        fatGrams: 5,
        explanation: "Staging Kaçamak kabul öğünü",
      },
    ],
    totalCalories: 400,
    totalProteinGrams: 20,
    totalCarbsGrams: 58,
    totalFatGrams: 11,
  }));
  return {
    durationDays: 7,
    cycleLengthDays: 7,
    cycle,
    calendar: Array.from({ length: 7 }, (_, index) => ({ dayNumber: index + 1, cycleIndex: index })),
  };
}

async function createAccount(email: string, tier: "FREE" | "PREMIUM_PLUS") {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: "Staging Kaçamak",
      onboardingCompleted: true,
      subscriptionTier: tier,
      profile: {
        create: {
          dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
          gender: "PREFER_NOT_TO_SAY",
          heightCm: 175,
          currentWeightKg: 75,
          targetWeightKg: 70,
          activityLevel: "MODERATE",
          healthConditions: [],
          allergies: [],
          dietaryPreference: "OMNIVORE",
          dailyWaterGoalMl: 2500,
          usualWakeTime: "07:00",
          usualSleepTime: "23:00",
          workScheduleType: "REGULAR",
        },
      },
    },
  });

  if (tier !== "FREE") {
    const now = new Date();
    await prisma.subscription.create({
      data: {
        userId: user.id,
        tier,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });
  }

  const plan = await prisma.nutritionPlan.create({
    data: {
      userId: user.id,
      startDate: new Date(`${istanbulYmd()}T00:00:00.000Z`),
      duration: "SEVEN_DAY",
      version: 1,
      isActive: true,
      status: "COMPLETED",
      bmr: 1600,
      tdee: 2200,
      dailyCalories: 1900,
      proteinGrams: 120,
      carbsGrams: 210,
      fatGrams: 60,
      waterMl: 2500,
      mealsPerDay: 2,
      mealTiming: { mealsPerDay: 2, slots: [] } as Prisma.InputJsonValue,
      dailyPlans: content() as Prisma.InputJsonValue,
      explanations: {} as Prisma.InputJsonValue,
      recommendations: [] as Prisma.InputJsonValue,
      summary: "Staging Kaçamak acceptance fixture",
    },
  });
  return { user, plan };
}

async function login(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`fixture login failed ${response.status}`);
  const body = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return body.data.tokens.accessToken;
}

async function grantConsents(baseUrl: string, email: string): Promise<void> {
  const token = await login(baseUrl, email);
  for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"]) {
    const response = await fetch(`${baseUrl}/api/legal/consents`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ type }),
    });
    if (!response.ok) throw new Error(`fixture consent ${type} failed ${response.status}`);
  }
}

async function seed(baseUrl: string, outputPath: string): Promise<void> {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const premiumEmail = `staging-kacamak-premium-${stamp}@example.com`;
  const freeEmail = `staging-kacamak-free-${stamp}@example.com`;
  const downgradedEmail = `staging-kacamak-downgraded-${stamp}@example.com`;

  const premium = await createAccount(premiumEmail, "PREMIUM_PLUS");
  const free = await createAccount(freeEmail, "FREE");
  const downgraded = await createAccount(downgradedEmail, "FREE");

  const deviation = await prisma.nutritionPlanDeviation.create({
    data: {
      userId: downgraded.user.id,
      planId: downgraded.plan.id,
      dayNumber: 1,
      mealIndex: 0,
      foodIndex: 0,
      scope: "FOOD",
      type: "SKIPPED",
      plannedItemName: "Tam buğday ekmeği",
      plannedPortion: "100 g",
      note: "Downgrade persistence fixture",
    },
  });

  for (const email of [premiumEmail, freeEmail, downgradedEmail]) {
    await grantConsents(baseUrl, email);
  }

  const fixture: FixtureFile = {
    premiumPlus: { email: premiumEmail, password: PASSWORD, planId: premium.plan.id },
    free: { email: freeEmail, password: PASSWORD, planId: free.plan.id },
    downgraded: {
      email: downgradedEmail,
      password: PASSWORD,
      planId: downgraded.plan.id,
      deviationId: deviation.id,
    },
  };
  await fs.writeFile(outputPath, JSON.stringify(fixture), "utf8");
}

async function cleanup(outputPath: string): Promise<void> {
  try {
    const fixture = JSON.parse(await fs.readFile(outputPath, "utf8")) as FixtureFile;
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [fixture.premiumPlus.email, fixture.free.email, fixture.downgraded.email],
        },
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const [mode, baseUrlOrPath, maybePath] = process.argv.slice(2);
try {
  if (mode === "seed" && baseUrlOrPath && maybePath) {
    await seed(baseUrlOrPath.replace(/\/$/, ""), maybePath);
  } else if (mode === "cleanup" && baseUrlOrPath) {
    await cleanup(baseUrlOrPath);
  } else {
    throw new Error("Usage: staging-kacamak-fixture.ts seed <baseUrl> <outputPath> | cleanup <outputPath>");
  }
} finally {
  await prisma.$disconnect();
}
