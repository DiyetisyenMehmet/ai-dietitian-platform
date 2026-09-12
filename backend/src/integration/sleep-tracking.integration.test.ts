import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../lib/prisma";
import { createSleepSchema } from "../modules/sleep/sleep.schemas";
import { sleepService } from "../modules/sleep/sleep.service";

test("FR-012 sleep lifecycle computes duration and daily/weekly analysis server-side", async (t) => {
  const user = await prisma.user.create({
    data: {
      email: `sleep-service-${Date.now()}@example.invalid`,
      passwordHash: "integration-test-only",
      fullName: "Sleep Integration",
      onboardingCompleted: true,
    },
  });

  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  assert.equal(
    createSleepSchema.safeParse({
      sleepStart: "2026-09-10T20:00:00.000Z",
      wakeTime: "2026-09-11T04:30:00.000Z",
      quality: 6,
    }).success,
    false,
  );

  await assert.rejects(
    sleepService.create(user.id, {
      sleepStart: "2026-09-10T20:00:00.000Z",
      wakeTime: "2026-09-10T20:10:00.000Z",
      quality: 3,
    }),
    /at least 15 minutes/i,
  );

  const first = await sleepService.create(user.id, {
    sleepStart: "2026-09-10T20:00:00.000Z",
    wakeTime: "2026-09-11T04:30:00.000Z",
    quality: 4,
    note: "Dinlenmiş uyandım",
  });
  assert.equal(first.durationMinutes, 510);

  const second = await sleepService.create(user.id, {
    sleepStart: "2026-09-11T20:30:00.000Z",
    wakeTime: "2026-09-12T04:00:00.000Z",
    quality: 3,
  });
  assert.equal(second.durationMinutes, 450);

  const updated = await sleepService.update(user.id, second.id, { quality: 4 });
  assert.equal(updated.quality, 4);
  assert.equal(updated.durationMinutes, 450);

  const turkeyOffset = -180;
  const daily = await sleepService.getDailyAssessment(user.id, "2026-09-11", turkeyOffset);
  assert.equal(daily.entries, 1);
  assert.equal(daily.totalDurationMinutes, 510);
  assert.equal(daily.status, "GOOD");
  assert.equal(daily.averageQuality, 4);

  const weekly = await sleepService.getWeeklyAnalysis(user.id, "2026-09-12", turkeyOffset);
  assert.equal(weekly.nightsLogged, 2);
  assert.equal(weekly.averageDurationMinutes, 480);
  assert.equal(weekly.averageQuality, 4);
  assert.equal(weekly.targetNights, 2);
  assert.equal(weekly.targetRatePercent, 100);
  assert.ok((weekly.sleepScore ?? 0) > 0);
  assert.ok((weekly.regularityScore ?? 0) > 0);

  const listed = await sleepService.list(user.id);
  assert.equal(listed.length, 2);

  await sleepService.remove(user.id, first.id);
  const remaining = await sleepService.list(user.id);
  assert.equal(remaining.length, 1);
});
