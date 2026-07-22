import type { Prisma } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { notificationService } from "../notifications/notification.service";
import { aiMemoryService } from "./ai-memory.service";
import { daysWithMeals, loadCoachData } from "./coach-data";
import { average, daysAgo, groupBy, sum, turkeyDayKey } from "./metrics";
import type { RiskAlert } from "./types";

/** Thresholds for the coaching risk checks (nutrition guidance, not diagnosis). */
const PROTEIN_MIN_G_PER_KG = 0.8;
const SODIUM_MAX_MG_PER_DAY = 2300;
const SUGAR_MAX_G_PER_DAY = 50;
const RAPID_WEIGHT_KG_PER_WEEK = 1;
const BLOOD_TEST_STALE_DAYS = 90;
const INACTIVITY_DAYS = 5;
const MEAL_CONSISTENCY_WINDOW_DAYS = 14;

/** Averages a per-day total over the number of distinct days that had data. */
function averagePerLoggedDay(values: { loggedAt: Date; amount: number }[]): number {
  const byDay = groupBy(values, (v) => turkeyDayKey(v.loggedAt));
  const dailyTotals: number[] = [];
  for (const items of byDay.values()) {
    dailyTotals.push(sum(items.map((i) => i.amount)));
  }
  return average(dailyTotals);
}

/**
 * Risk Detection service (Sprint 19, Section 5).
 *
 * Runs 8 nutrition/lifestyle checks and returns coaching recommendations. It
 * NEVER produces a medical diagnosis — every finding is framed as a supportive
 * coaching suggestion. High-severity findings also raise a proactive message
 * and a scheduled notification.
 */
export const riskDetectionService = {
  async detectRisks(userId: string): Promise<RiskAlert[]> {
    const bundle = await loadCoachData(userId, 30);
    const alerts: RiskAlert[] = [];

    const bodyWeightKg = bundle.weightLogs[0]?.weightKg ?? bundle.profile?.currentWeightKg ?? null;

    // Last-7-days meal slices.
    const meals7 = bundle.mealLogs.filter((m) => m.loggedAt >= daysAgo(7));

    // 1. Low protein (< 0.8 g/kg body weight).
    if (bodyWeightKg && meals7.length > 0) {
      const avgProtein = averagePerLoggedDay(
        meals7.map((m) => ({ loggedAt: m.loggedAt, amount: m.proteinG ?? 0 })),
      );
      const minProtein = PROTEIN_MIN_G_PER_KG * bodyWeightKg;
      if (avgProtein > 0 && avgProtein < minProtein) {
        alerts.push({
          type: "LOW_PROTEIN",
          severity: avgProtein < minProtein * 0.7 ? "high" : "medium",
          message: `Günlük ortalama protein alımın (~${Math.round(avgProtein)} g) hedefin (~${Math.round(minProtein)} g) altında.`,
          recommendation:
            "Öğünlerine yumurta, yoğurt, baklagil veya yağsız et gibi protein kaynakları eklemeyi dene.",
        });
      }
    }

    // 2. High sodium (> 2300 mg/day avg over last 7 days).
    if (meals7.some((m) => m.sodiumMg != null)) {
      const avgSodium = averagePerLoggedDay(
        meals7.map((m) => ({ loggedAt: m.loggedAt, amount: m.sodiumMg ?? 0 })),
      );
      if (avgSodium > SODIUM_MAX_MG_PER_DAY) {
        alerts.push({
          type: "HIGH_SODIUM",
          severity: avgSodium > SODIUM_MAX_MG_PER_DAY * 1.5 ? "high" : "medium",
          message: `Günlük ortalama sodyum alımın (~${Math.round(avgSodium)} mg) önerilen sınırın (2300 mg) üzerinde.`,
          recommendation:
            "İşlenmiş gıdaları ve tuz eklemeyi azaltmayı, taze malzemeleri tercih etmeyi düşünebilirsin.",
        });
      }
    }

    // 3. High sugar (> 50 g/day avg).
    if (meals7.some((m) => m.sugarG != null)) {
      const avgSugar = averagePerLoggedDay(
        meals7.map((m) => ({ loggedAt: m.loggedAt, amount: m.sugarG ?? 0 })),
      );
      if (avgSugar > SUGAR_MAX_G_PER_DAY) {
        alerts.push({
          type: "HIGH_SUGAR",
          severity: avgSugar > SUGAR_MAX_G_PER_DAY * 1.5 ? "high" : "medium",
          message: `Günlük ortalama şeker alımın (~${Math.round(avgSugar)} g) önerilen sınırın (50 g) üzerinde.`,
          recommendation:
            "Şekerli içecekler ve tatlılar yerine meyve veya sade su tüketmeyi deneyebilirsin.",
        });
      }
    }

    // 4 & 5. Rapid weight gain / loss (> 1 kg in 7 days).
    const weights7 = bundle.weightLogs.filter((w) => w.loggedAt >= daysAgo(7));
    if (weights7.length >= 2) {
      const newest = weights7[0].weightKg;
      const oldest = weights7[weights7.length - 1].weightKg;
      const change = newest - oldest;
      if (change >= RAPID_WEIGHT_KG_PER_WEEK) {
        alerts.push({
          type: "RAPID_WEIGHT_GAIN",
          severity: change >= RAPID_WEIGHT_KG_PER_WEEK * 2 ? "high" : "medium",
          message: `Son 7 günde ~${change.toFixed(1)} kg artış görüldü.`,
          recommendation:
            "Hızlı değişimler sıvı dengesiyle de ilgili olabilir. Öğün düzenini gözden geçir ve tutarlı ilerlemeye odaklan.",
        });
      } else if (change <= -RAPID_WEIGHT_KG_PER_WEEK) {
        alerts.push({
          type: "RAPID_WEIGHT_LOSS",
          severity: change <= -RAPID_WEIGHT_KG_PER_WEEK * 2 ? "high" : "medium",
          message: `Son 7 günde ~${Math.abs(change).toFixed(1)} kg azalma görüldü.`,
          recommendation:
            "Çok hızlı kilo kaybı sürdürülebilir olmayabilir. Yeterli kalori ve protein aldığından emin ol.",
        });
      }
    }

    // 6. Missing blood tests (none in last 90 days).
    if (!bundle.lastAnalysisAt || bundle.lastAnalysisAt < daysAgo(BLOOD_TEST_STALE_DAYS)) {
      alerts.push({
        type: "MISSING_BLOOD_TEST",
        severity: "low",
        message: "Son 90 günde kayıtlı bir kan tahlili analizi bulunmuyor.",
        recommendation:
          "Beslenme önerilerini daha iyi kişiselleştirebilmek için güncel bir kan tahlili yüklemeyi düşünebilirsin.",
      });
    }

    // 7. Inactive lifestyle (no meal/weight logs in 5+ days).
    const lastActivity = [...bundle.mealLogs, ...bundle.weightLogs]
      .map((l) => l.loggedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (!lastActivity || lastActivity < daysAgo(INACTIVITY_DAYS)) {
      alerts.push({
        type: "INACTIVE_LIFESTYLE",
        severity: "medium",
        message: "Son 5 gündür herhangi bir öğün veya kilo kaydı görünmüyor.",
        recommendation:
          "Küçük bir başlangıç bile önemli: bugün bir öğününü veya kilonu kaydederek geri dön.",
      });
    }

    // 8. Poor meal consistency (< 50% of days with 3+ meals in last 14 days).
    const meals14 = bundle.mealLogs.filter(
      (m) => m.loggedAt >= daysAgo(MEAL_CONSISTENCY_WINDOW_DAYS),
    );
    const goodDays = daysWithMeals(meals14, 3);
    if (goodDays / MEAL_CONSISTENCY_WINDOW_DAYS < 0.5) {
      alerts.push({
        type: "POOR_MEAL_CONSISTENCY",
        severity: goodDays === 0 ? "medium" : "low",
        message: `Son 14 günün yalnızca ${goodDays} gününde 3 veya daha fazla öğün kaydettin.`,
        recommendation:
          "Düzenli öğün kaydı, koçun sana daha isabetli öneriler sunmasını sağlar. Günde 3 öğünü kaydetmeyi hedefle.",
      });
    }

    // Persist a snapshot in memory and raise proactive messages/notifications
    // for high-severity findings. Best-effort — never fails the read.
    await this.persistAndEscalate(userId, alerts).catch((error: unknown) => {
      logger.warn({ err: error, userId }, "Risk persistence/escalation failed");
    });

    return alerts;
  },

  /** Stores risks in memory and escalates high-severity ones. */
  async persistAndEscalate(userId: string, alerts: RiskAlert[]): Promise<void> {
    await aiMemoryService.upsertMemory(userId, "MISTAKES", {
      kind: "risk_snapshot",
      at: new Date().toISOString(),
      risks: alerts as unknown as Prisma.InputJsonValue,
    });

    const highs = alerts.filter((a) => a.severity === "high");
    for (const risk of highs) {
      // Avoid spamming: only one unread RISK_ALERT proactive message per type/day.
      const existing = await prisma.proactiveMessage.findFirst({
        where: {
          userId,
          type: "RISK_ALERT",
          isRead: false,
          createdAt: { gte: daysAgo(1) },
          message: { contains: risk.type },
        },
      });
      if (existing) continue;

      await prisma.proactiveMessage.create({
        data: {
          userId,
          type: "RISK_ALERT",
          message: `[${risk.type}] ${risk.message} ${risk.recommendation}`,
        },
      });
      await notificationService.scheduleNotification(
        userId,
        "RISK_ALERT",
        "Sağlık koçundan bir hatırlatma",
        `${risk.message} ${risk.recommendation}`,
        new Date(),
        { riskType: risk.type, severity: risk.severity },
      );
    }
  },
};
