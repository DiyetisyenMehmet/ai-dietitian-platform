import { expect, test } from "@playwright/test";

import type { WeightEntry } from "../src/domain/health/types";
import {
  calendarDaySpan,
  parseWeightInput,
  sortWeightEntries,
  type WeightEntryTiming,
} from "../src/application/health/weight-utils";
import { analyzeProgressStats } from "../src/application/health/progress-analytics";
import { buildWeightChartGeometry } from "../src/presentation/components/health/weight-chart";

function entry(
  id: string,
  date: string,
  weightKg: number,
  loggedAt = `${date}T12:00:00.000Z`,
): WeightEntry {
  return {
    id,
    date,
    weightKg,
    loggedAt,
    createdAt: loggedAt,
  } as WeightEntry & WeightEntryTiming;
}

test.describe("weight frontend data integrity", () => {
  test("accepts Turkish decimal and enforces backend weight precision/range", () => {
    expect(parseWeightInput("80,5")).toBe(80.5);
    expect(parseWeightInput("80.5")).toBe(80.5);
    expect(parseWeightInput("25")).toBe(25);
    expect(parseWeightInput("400")).toBe(400);
    expect(parseWeightInput("0")).toBeNull();
    expect(parseWeightInput("24,9")).toBeNull();
    expect(parseWeightInput("400,1")).toBeNull();
    expect(parseWeightInput("78,44")).toBeNull();
    expect(parseWeightInput("abc")).toBeNull();
  });

  test("preserves all same-day entries and orders them by exact loggedAt", () => {
    const input = [
      entry("late", "2026-09-16", 79.8, "2026-09-16T18:00:00.000Z"),
      entry("backdated", "2026-09-10", 82, "2026-09-10T09:00:00.000Z"),
      entry("early", "2026-09-16", 80.2, "2026-09-16T07:00:00.000Z"),
    ];
    const sorted = sortWeightEntries(input);

    expect(sorted).toHaveLength(3);
    expect(sorted.map((item) => item.id)).toEqual(["backdated", "early", "late"]);
    expect(sorted.at(-1)?.weightKg).toBe(79.8);
  });

  test("same-day measurements do not create a weekly pace or ETA", () => {
    const input = [
      entry("a", "2026-09-16", 80.2, "2026-09-16T07:00:00.000Z"),
      entry("b", "2026-09-16", 79.8, "2026-09-16T18:00:00.000Z"),
    ];
    const stats = analyzeProgressStats(input, 75);

    expect(calendarDaySpan(input[0], input[1])).toBe(0);
    expect(stats.avgWeeklyChangeKg).toBeNull();
    expect(stats.estimatedTargetDate).toBeNull();
    expect(stats.estimatedTargetLabel).toBeNull();
  });

  test("chart safely handles zero, one and many points", () => {
    expect(buildWeightChartGeometry([], 75)).toBeNull();

    const single = buildWeightChartGeometry([entry("one", "2026-09-16", 80.5)], 75);
    expect(single?.points).toHaveLength(1);
    expect(single?.linePath).toBeNull();
    expect(single?.areaPath).toBeNull();
    expect(Number.isFinite(single?.points[0]?.x ?? Number.NaN)).toBeTruthy();
    expect(Number.isFinite(single?.points[0]?.y ?? Number.NaN)).toBeTruthy();

    const many = buildWeightChartGeometry(
      [
        entry("new", "2026-09-16", 80, "2026-09-16T18:00:00.000Z"),
        entry("old", "2026-01-01", 84, "2026-01-01T08:00:00.000Z"),
        entry("same-day", "2026-09-16", 80.4, "2026-09-16T07:00:00.000Z"),
      ],
      0,
    );
    expect(many?.points).toHaveLength(3);
    expect(many?.linePath).not.toBeNull();
    expect(many?.targetY).toBeNull();
    expect(many?.yMin).toBeGreaterThan(70);
    for (const point of many?.points ?? []) {
      expect(Number.isFinite(point.x)).toBeTruthy();
      expect(Number.isFinite(point.y)).toBeTruthy();
    }
  });
});
