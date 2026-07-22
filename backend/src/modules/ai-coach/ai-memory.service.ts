import type { AiMemory, AiMemoryType, Prisma } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import {
  daysWithMeals,
  deriveWeight,
  loadCoachData,
  mealDayCoverage,
  type CoachDataBundle,
} from "./coach-data";
import { average, daysAgo, sum } from "./metrics";
import { memoryWindowDays } from "./premium";
import type { MemoryEntry } from "./types";

/** JSON-serializable content payload for a memory entry. */
type MemoryContent = Record<string, unknown>;

interface UpsertOptions {
  /** Optional TTL for the memory. */
  expiresAt?: Date | null;
  /** When true, always insert a new row (history) instead of replacing latest. */
  append?: boolean;
  /** Optional embedding vector for future semantic retrieval. */
  embedding?: number[];
}

/**
 * AI Long-Term Memory service (Sprint 19, Section 1).
 *
 * Persists durable, structured facts the coach recalls across conversations so
 * it never repeats identical advice for an unchanged situation. Two families of
 * memory exist:
 *   - DERIVED (weight trend, meal habits, activity): recomputed from logs.
 *   - RECORDED (mistakes, goals, achievements, conversation summaries): written
 *     by other flows and read back here.
 * `buildMemoryContext` renders a compact, Turkish, non-identifying prompt block
 * injected into every AI chat turn.
 */
export const aiMemoryService = {
  /**
   * Upserts a memory. By default replaces the latest row of that type for the
   * user (a single "memory of record"); pass `append` to keep history (e.g. for
   * user-reported mistakes).
   */
  async upsertMemory(
    userId: string,
    memoryType: AiMemoryType,
    content: MemoryContent,
    options: UpsertOptions = {},
  ): Promise<AiMemory> {
    const data = {
      content: content as Prisma.InputJsonValue,
      expiresAt: options.expiresAt ?? null,
      ...(options.embedding ? { embedding: options.embedding as Prisma.InputJsonValue } : {}),
    };

    if (!options.append) {
      const existing = await prisma.aiMemory.findFirst({
        where: { userId, memoryType },
        orderBy: { updatedAt: "desc" },
      });
      if (existing) {
        return prisma.aiMemory.update({ where: { id: existing.id }, data });
      }
    }

    return prisma.aiMemory.create({ data: { userId, memoryType, ...data } });
  },

  /**
   * Returns the user's non-expired memories, newest first, optionally filtered
   * by type. `windowDays` bounds how far back recorded memories are considered.
   */
  async getRelevantMemory(
    userId: string,
    options: { windowDays?: number; types?: AiMemoryType[]; limit?: number } = {},
  ): Promise<MemoryEntry[]> {
    const now = new Date();
    const since = options.windowDays ? daysAgo(options.windowDays) : undefined;
    const rows = await prisma.aiMemory.findMany({
      where: {
        userId,
        ...(options.types ? { memoryType: { in: options.types } } : {}),
        ...(since ? { updatedAt: { gte: since } } : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { updatedAt: "desc" },
      ...(options.limit ? { take: options.limit } : {}),
    });
    return rows.map((r) => ({
      memoryType: r.memoryType,
      content: (r.content as MemoryContent) ?? {},
      updatedAt: r.updatedAt,
    }));
  },

  /**
   * Recomputes and persists DERIVED memories (weight trend, meal habits,
   * activity) from the latest logs. Called by the daily job and after reviews so
   * stored memory stays fresh. Best-effort: failures are logged, not thrown.
   */
  async refreshDerivedMemory(userId: string, windowDays: number): Promise<void> {
    try {
      const bundle = await loadCoachData(userId, windowDays);
      const snapshots = this.buildDerivedSnapshots(bundle);
      await this.upsertMemory(userId, "WEIGHT_TREND", snapshots.weightTrend);
      await this.upsertMemory(userId, "MEAL_HABITS", snapshots.mealHabits);
      await this.upsertMemory(userId, "ACTIVITY", snapshots.activity);
      // NOTE: GOALS are derived live in buildMemoryContext (from the profile), so
      // they are not persisted here. The GOALS memory type is reserved for
      // Dynamic Nutrition Adaptation records (Section 4).
    } catch (error) {
      logger.warn({ err: error, userId }, "refreshDerivedMemory failed");
    }
  },

  /** Pure computation of derived memory snapshots from a data bundle. */
  buildDerivedSnapshots(bundle: CoachDataBundle): {
    weightTrend: MemoryContent;
    mealHabits: MemoryContent;
    activity: MemoryContent;
    goals: MemoryContent | null;
  } {
    const weight = deriveWeight(bundle.weightLogs, bundle.profile);

    // Meal habits: breakfast-skip detection + average logged meals per day.
    const breakfastDays = new Set(
      bundle.mealLogs
        .filter((m) => m.mealType === "BREAKFAST")
        .map((m) => m.loggedAt.toISOString().slice(0, 10)),
    ).size;
    const loggedDays = new Set(bundle.mealLogs.map((m) => m.loggedAt.toISOString().slice(0, 10)))
      .size;
    const skipsBreakfast = loggedDays >= 3 && breakfastDays / Math.max(1, loggedDays) < 0.4;
    const avgProtein = average(bundle.mealLogs.map((m) => m.proteinG ?? 0).filter((v) => v > 0));

    const mealHabits: MemoryContent = {
      loggedDays,
      daysWith3PlusMeals: daysWithMeals(bundle.mealLogs, 3),
      coverage: Number(mealDayCoverage(bundle.mealLogs, bundle.windowDays).toFixed(2)),
      skipsBreakfast,
      avgProteinG: Number(avgProtein.toFixed(1)),
    };

    // Activity: any logs at all are a proxy for engagement.
    const lastLog = [...bundle.weightLogs, ...bundle.mealLogs, ...bundle.waterLogs]
      .map((l) => l.loggedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const activity: MemoryContent = {
      totalLogs: bundle.weightLogs.length + bundle.mealLogs.length + bundle.waterLogs.length,
      lastActivityAt: lastLog ? lastLog.toISOString() : null,
      avgDailyWaterMl:
        bundle.waterLogs.length > 0
          ? Math.round(sum(bundle.waterLogs.map((w) => w.amountMl)) / bundle.windowDays)
          : 0,
    };

    const goals: MemoryContent | null = bundle.profile
      ? {
          currentWeightKg: bundle.profile.currentWeightKg,
          targetWeightKg: bundle.profile.targetWeightKg,
          direction:
            bundle.profile.targetWeightKg < bundle.profile.currentWeightKg
              ? "lose"
              : bundle.profile.targetWeightKg > bundle.profile.currentWeightKg
                ? "gain"
                : "maintain",
        }
      : null;

    const weightTrend: MemoryContent = {
      trend: weight.trend,
      latestKg: weight.latestKg,
      deltaKg: weight.deltaKg === null ? null : Number(weight.deltaKg.toFixed(1)),
      weekOverWeekKg:
        weight.weekOverWeekKg === null ? null : Number(weight.weekOverWeekKg.toFixed(2)),
    };

    return { weightTrend, mealHabits, activity, goals };
  },

  /**
   * Builds the Turkish, non-identifying memory context string prepended to the
   * AI system prompt. Premium callers get a 90-day window; free callers 14 days.
   * Returns an empty string when there is nothing worth recalling.
   */
  async buildMemoryContext(userId: string, isPremium: boolean): Promise<string> {
    const windowDays = memoryWindowDays(isPremium);
    let bundle: CoachDataBundle;
    try {
      bundle = await loadCoachData(userId, windowDays);
    } catch (error) {
      logger.warn({ err: error, userId }, "buildMemoryContext data load failed");
      return "";
    }

    const derived = this.buildDerivedSnapshots(bundle);
    const recorded = await this.getRelevantMemory(userId, {
      windowDays,
      types: ["MISTAKES", "CONVERSATION_SUMMARY", "BLOOD_TESTS", "ACHIEVEMENTS"],
      limit: 12,
    });

    const lines: string[] = [];
    lines.push("KULLANICI HAFIZASI (geçmişe dayalı bağlam — aynı tavsiyeyi tekrar etme):");

    if (derived.goals) {
      const g = derived.goals as {
        currentWeightKg: number;
        targetWeightKg: number;
        direction: string;
      };
      const dir =
        g.direction === "lose" ? "kilo verme" : g.direction === "gain" ? "kilo alma" : "koruma";
      lines.push(
        `- Hedef: ${dir} (mevcut ${g.currentWeightKg} kg → hedef ${g.targetWeightKg} kg).`,
      );
    }

    const wt = derived.weightTrend as { trend: string; weekOverWeekKg: number | null };
    const trendTr =
      wt.trend === "IMPROVING" ? "olumlu" : wt.trend === "DECLINING" ? "olumsuz" : "sabit";
    if (bundle.weightLogs.length > 0) {
      const wow = wt.weekOverWeekKg;
      lines.push(
        `- Kilo eğilimi: ${trendTr}${wow !== null ? ` (haftalık ${wow > 0 ? "+" : ""}${wow} kg)` : ""}.`,
      );
    }

    const mh = derived.mealHabits as {
      skipsBreakfast: boolean;
      avgProteinG: number;
      coverage: number;
    };
    if (mh.skipsBreakfast) {
      lines.push("- Alışkanlık: kullanıcı sık sık kahvaltı öğününü atlıyor.");
    }
    if (mh.avgProteinG > 0) {
      lines.push(`- Ortalama günlük protein (kayıtlı): ~${mh.avgProteinG} g.`);
    }

    if (bundle.latestAnalysis) {
      lines.push(
        `- Son kan tahlili analizi mevcut (${bundle.latestAnalysis.abnormalCount} anormal değer).`,
      );
    }

    for (const mem of recorded) {
      if (mem.memoryType === "MISTAKES" && typeof mem.content.note === "string") {
        lines.push(`- Not (kullanıcı beyanı): ${mem.content.note}`);
      } else if (
        mem.memoryType === "CONVERSATION_SUMMARY" &&
        typeof mem.content.summary === "string"
      ) {
        lines.push(`- Önceki konuşma özeti: ${mem.content.summary}`);
      } else if (mem.memoryType === "ACHIEVEMENTS" && typeof mem.content.label === "string") {
        lines.push(`- Başarı: ${mem.content.label}`);
      }
    }

    // Nothing beyond the header → no useful memory yet.
    if (lines.length <= 1) return "";
    return lines.join("\n");
  },
};
