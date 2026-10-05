import { writeFile } from "node:fs/promises";
import { createApp } from "../../../app";
import { prisma } from "../../../lib/prisma";
import { setAIAdapter } from "../../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { FixtureAdapter } from "./provider";

async function main() {
  if (process.env.NODE_ENV !== "test" || process.env.DIEWISH_ENVIRONMENT !== "test")
    throw new Error("Nutrition browser fixtures require an isolated test environment");
  const adapter = new FixtureAdapter();
  adapter.delay = 350;
  adapter.slowVegetarianDelay = 16000;
  setAIAdapter(adapter);
  const server = createApp().listen(4000, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const fixtures: Record<string, { email: string; password: string; token: string; id: string }> =
    {};
  const post = async (path: string, body: unknown, token = "") => {
    const res = await fetch(`http://127.0.0.1:4000/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const value = (await res.json()) as {
      success: boolean;
      data: { user: { id: string }; tokens: { accessToken: string } };
    };
    if (!res.ok) throw new Error(`Fixture setup failed: ${path} HTTP ${res.status}`);
    return value;
  };
  for (const name of ["free", "premium7", "premium14", "premium30", "weightDue", "slow7"]) {
    const email = `nutrition-browser-${name}-${Date.now()}@example.com`,
      password = "NutritionFixture123!";
    const reg = await post("/auth/register", {
      email,
      password,
      fullName: "Nutrition Browser Test",
    });
    const id = reg.data.user.id,
      token = reg.data.tokens.accessToken;
    for (const type of ["TERMS_OF_SERVICE", "MEDICAL_DISCLAIMER", "KVKK_EXPLICIT_CONSENT"])
      await post("/legal/consents", { type }, token);
    await post(
      "/onboarding",
      {
        fullName: "Nutrition Browser Test",
        dateOfBirth: "1990-05-20",
        gender: "PREFER_NOT_TO_SAY",
        heightCm: 175,
        currentWeightKg: 70,
        targetWeightKg: 65,
        activityLevel: "MODERATE",
        healthConditions: [],
        allergies: [],
        dietaryPreference: name === "slow7" ? "VEGETARIAN" : "OMNIVORE",
        dailyWaterGoalMl: 2500,
        workScheduleType: "REGULAR",
        usualWakeTime: "07:00",
        usualSleepTime: "23:00",
      },
      token,
    );
    if (name.startsWith("premium")) {
      await prisma.user.update({ where: { id }, data: { subscriptionTier: "PREMIUM" } });
      await prisma.subscription.create({
        data: {
          userId: id,
          tier: "PREMIUM",
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() + 86400000 * 30),
        },
      });
    }
    if (name === "weightDue")
      await prisma.weightLog.updateMany({
        where: { userId: id },
        data: { loggedAt: new Date(Date.now() - 86400000 * 9) },
      });
    fixtures[name] = { email, password, token, id };
  }
  await writeFile(
    process.env.NUTRITION_TEST_FIXTURE_FILE || "/tmp/nutrition-fixtures.json",
    JSON.stringify(fixtures),
    { mode: 0o600 },
  );
  console.log("Isolated nutrition browser fixtures ready");
  process.on("SIGTERM", () => {
    server.closeAllConnections();
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  });
}
void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
