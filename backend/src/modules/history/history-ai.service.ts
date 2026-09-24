import { createHash } from "node:crypto";
import { HistoryInsightScope, HistoryInsightSource, type Prisma } from "@prisma/client";

import { logger } from "../../lib/logger";
import { DISCLAIMER } from "../blood-test-analysis/constants";
import { getAIAdapter } from "../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { historyComparisonService } from "./history-comparison";
import { normalizeHistoryInsightText } from "./history-ai-text";
import { historyRepository } from "./history.repository";
import { historyService } from "./history.service";
import type {
  DailyHistoryResponse,
  HistoryComparisonResponse,
  HistoryInsightResponse,
  HistoryInsightScopeName,
  ObservedNumber,
} from "./history.types";

export const HISTORY_INSIGHT_CONTEXT_VERSION = "history-insight-v3";
const MAX_INSIGHT_LENGTH = 2400;

type InsightContext = DailyInsightContext | PeriodInsightContext;

interface DailyInsightContext {
  contextVersion: string;
  scope: "DAY";
  date: string;
  timezone: string;
  completeness: DailyHistoryResponse["completeness"];
  nutrition: {
    status: string;
    mealTypesRecorded: string[];
    totals: DailyHistoryResponse["nutrition"]["totals"];
  };
  water: {
    status: string;
    totalMl: ObservedNumber;
    currentGoalMl: ObservedNumber | null;
  };
  activity: {
    status: string;
    totalActiveMinutes: ObservedNumber;
    totalDistanceKm: ObservedNumber;
    totalCaloriesBurned: ObservedNumber;
    activityCount: number;
  };
  sleep: {
    status: string;
    totalDurationMinutes: ObservedNumber;
    averageQuality: ObservedNumber;
    entryCount: number;
  };
  weight: {
    status: string;
    measurementKg: number | null;
  };
}

interface PeriodInsightContext {
  contextVersion: string;
  scope: "WEEK" | "MONTH" | "CUSTOM";
  timezone: string;
  comparisonMode: HistoryComparisonResponse["comparisonMode"];
  currentPeriod: HistoryComparisonResponse["currentPeriod"];
  previousPeriod: HistoryComparisonResponse["previousPeriod"];
  completeness: HistoryComparisonResponse["completeness"];
  metrics: HistoryComparisonResponse["metrics"];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

export function canonicalHistoryContext(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function createHistoryContextHash(value: unknown): string {
  return createHash("sha256").update(canonicalHistoryContext(value)).digest("hex");
}

export function shouldBypassHistoryInsightCache(partial: boolean, noData: boolean): boolean {
  return partial || noData;
}

function dailyContext(history: DailyHistoryResponse): DailyInsightContext {
  return {
    contextVersion: HISTORY_INSIGHT_CONTEXT_VERSION,
    scope: "DAY",
    date: history.date,
    timezone: history.timezone,
    completeness: history.completeness,
    nutrition: {
      status: history.nutrition.status,
      mealTypesRecorded: history.completeness.nutrition.mealTypesRecorded,
      totals: history.nutrition.totals,
    },
    water: {
      status: history.water.status,
      totalMl: history.water.totalMl,
      currentGoalMl: historyWaterGoalForInsight(history),
    },
    activity: {
      status: history.activity.status,
      totalActiveMinutes: history.activity.totalActiveMinutes,
      totalDistanceKm: history.activity.totalDistanceKm,
      totalCaloriesBurned: history.activity.totalCaloriesBurned,
      activityCount: history.activity.entries.length,
    },
    sleep: {
      status: history.sleep.status,
      totalDurationMinutes: history.sleep.totalDurationMinutes,
      averageQuality: history.sleep.averageQuality,
      entryCount: history.sleep.entries.length,
    },
    weight: {
      status: history.weight.status,
      measurementKg: history.weight.measurement?.weightKg ?? null,
    },
  };
}

export function historyWaterGoalForInsight(history: DailyHistoryResponse): ObservedNumber | null {
  const goal = history.water.currentGoalMl;
  if (!history.water.historicalGoalComparisonAvailable) return null;
  if (goal.state !== "KNOWN_ZERO" && goal.state !== "KNOWN_VALUE") return null;
  if (goal.value === null || !Number.isFinite(goal.value) || goal.value <= 0) return null;
  return goal;
}

function periodContext(
  scope: "WEEK" | "MONTH" | "CUSTOM",
  comparison: HistoryComparisonResponse,
): PeriodInsightContext {
  return {
    contextVersion: HISTORY_INSIGHT_CONTEXT_VERSION,
    scope,
    timezone: comparison.timezone,
    comparisonMode: comparison.comparisonMode,
    currentPeriod: comparison.currentPeriod,
    previousPeriod: comparison.previousPeriod,
    completeness: comparison.completeness,
    metrics: comparison.metrics,
  };
}

function dailyPeriodKey(history: DailyHistoryResponse): string {
  return `DAY:${history.date}`;
}

export function comparisonPeriodKey(
  scope: "WEEK" | "MONTH" | "CUSTOM",
  comparison: HistoryComparisonResponse,
): string {
  if (scope === "CUSTOM") {
    return [
      "CUSTOM",
      comparison.currentPeriod.localStartDate,
      comparison.currentPeriod.localEndDateInclusive,
      comparison.previousPeriod.localStartDate,
      comparison.previousPeriod.localEndDateInclusive,
    ].join(":");
  }
  return `${scope}:${comparison.currentPeriod.localStartDate}`;
}

export function sanitizeHistoryInsightText(value: string): string {
  const text = normalizeHistoryInsightText(value);
  const disclaimer = normalizeHistoryInsightText(DISCLAIMER);
  if (!text.endsWith(disclaimer)) return text;
  return text.slice(0, -disclaimer.length).trim();
}

function parseCachedContent(value: unknown): { text: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const text = (value as Record<string, unknown>).text;
  if (typeof text !== "string") return null;
  const sanitized = sanitizeHistoryInsightText(text);
  return sanitized ? { text: sanitized } : null;
}

function hasDailyData(history: DailyHistoryResponse): boolean {
  return history.timeline.length > 0;
}

function periodCompletenessHasData(
  completeness: HistoryComparisonResponse["completeness"]["current"],
): boolean {
  return (
    completeness.nutrition.recordedDays > 0 ||
    completeness.water.recordedDays > 0 ||
    completeness.activity.recordedDays > 0 ||
    completeness.sleep.recordedDays > 0 ||
    completeness.weight.measurementCount > 0
  );
}

function hasPeriodData(comparison: HistoryComparisonResponse): boolean {
  return periodCompletenessHasData(comparison.completeness.current);
}

function hasCustomComparisonData(comparison: HistoryComparisonResponse): boolean {
  return (
    periodCompletenessHasData(comparison.completeness.current) ||
    periodCompletenessHasData(comparison.completeness.previous)
  );
}

function fallbackText(scope: HistoryInsightScopeName, partial: boolean, noData: boolean): string {
  if (noData) {
    return scope === "DAY"
      ? "Bugünkü kayıtlarına göre değerlendirme oluşturmak için henüz yeterli veri bulunmuyor."
      : "Bu dönem için değerlendirme oluşturmak adına henüz yeterli kayıt bulunmuyor.";
  }
  if (partial) {
    return scope === "DAY"
      ? "Bugünkü kayıtlarının bir bölümü şu anda kullanılamıyor. Mevcut kayıtların görüntülenmeye devam ediyor; değerlendirme geçici olarak oluşturulamadı."
      : "Bu dönemin bazı kayıtları şu anda kullanılamıyor. Karşılaştırmayı mevcut verilerle inceleyebilirsin; değerlendirme geçici olarak oluşturulamadı.";
  }
  return "Verilerin görüntülenebiliyor ancak değerlendirme şu anda oluşturulamadı. Biraz sonra yeniden deneyebilirsin.";
}

function promptFor(scope: HistoryInsightScopeName, context: InsightContext): string {
  const scopeRule =
    scope === "DAY"
      ? 'Cevaba mümkünse "Bugünkü kayıtlarına göre" veya "Kaydettiğin..." gibi veri kapsamını belirten bir ifadeyle başla.'
      : scope === "WEEK"
        ? 'Karşılaştırmada yalnız verilen dönemleri kullan; kayıt kapsamı sınırlıysa "Geçen haftanın aynı dönemindeki kayıtlara göre" gibi koşullu dil kullan.'
        : scope === "MONTH"
          ? 'Karşılaştırmada "Bu ay şimdiye kadarki kayıtlarında" gibi kapsamı açık ifadeler kullan.'
          : 'Bu özel karşılaştırmayı yalnız "1. dönem" ve "2. dönem" olarak anlat; hafta/ay varsayımı yapma ve verilen gerçek tarih aralıkları ile kayıt kapsamını esas al.';

  return [
    "Aşağıdaki Diewish History özetine göre Türkçe, kısa, destekleyici ve somut bir değerlendirme yaz.",
    "YALNIZ verilen veriyi kullan. Olmayan veya UNAVAILABLE/NO_RECORD/UNKNOWN veriyi uydurma.",
    "PARTIAL veya LIMITED kayıt kapsamını açıkça belirt; kesin genelleme yapma.",
    "Tanı, tedavi, ilaç, doz veya kesin tıbbi sonuç verme.",
    "İngilizce veya generic medikal disclaimer ekleme; blood-test/tahlil metni yazma.",
    "Su hedefi yalnız currentGoalMl açıkça mevcutsa kullanılabilir. currentGoalMl null ise hedefi uydurma ve hedefin tamamlandığını söyleme.",
    "Kalori, kilo veya başka bir metriğin artmasını/azalmasını hedef bağlamı yokken otomatik iyi/kötü sayma.",
    "Kullanıcıyı suçlayan veya utandıran dil kullanma.",
    "En fazla 4 kısa cümle kullan.",
    scopeRule,
    "Normalize edilmiş anonim bağlam:",
    canonicalHistoryContext(context),
  ].join("\n");
}

function fallbackResponse(
  scope: HistoryInsightScopeName,
  periodKey: string,
  timezone: string,
  partial: boolean,
  noData: boolean,
  generatedAt: Date,
): HistoryInsightResponse {
  return {
    scope,
    periodKey,
    timezone,
    content: { text: fallbackText(scope, partial, noData) },
    generatedBy: "FALLBACK",
    cacheStatus: "BYPASS",
    provider: null,
    model: null,
    generatedAt: generatedAt.toISOString(),
  };
}

const inFlight = new Map<string, Promise<HistoryInsightResponse>>();

async function generateAndCache(input: {
  userId: string;
  scope: HistoryInsightScopeName;
  prismaScope: HistoryInsightScope;
  periodKey: string;
  timezone: string;
  context: InsightContext;
  sourceFingerprint: unknown;
  partial: boolean;
  noData: boolean;
  generatedAt: Date;
}): Promise<HistoryInsightResponse> {
  if (shouldBypassHistoryInsightCache(input.partial, input.noData)) {
    return fallbackResponse(
      input.scope,
      input.periodKey,
      input.timezone,
      input.partial,
      input.noData,
      input.generatedAt,
    );
  }

  const contextHash = createHistoryContextHash({
    contextVersion: HISTORY_INSIGHT_CONTEXT_VERSION,
    scope: input.scope,
    timezone: input.timezone,
    periodKey: input.periodKey,
    sourceFingerprint: input.sourceFingerprint,
    context: input.context,
  });
  const singleFlightKey = [
    input.userId,
    input.scope,
    input.periodKey,
    input.timezone,
    contextHash,
  ].join(":");
  const existingFlight = inFlight.get(singleFlightKey);
  if (existingFlight) return existingFlight;

  const work = (async (): Promise<HistoryInsightResponse> => {
    const cached = await historyRepository.findInsight(
      input.userId,
      input.prismaScope,
      input.periodKey,
      input.timezone,
    );
    const cachedContent = cached ? parseCachedContent(cached.content) : null;
    if (cached && cached.contextHash === contextHash && cachedContent) {
      return {
        scope: input.scope,
        periodKey: input.periodKey,
        timezone: input.timezone,
        content: cachedContent,
        generatedBy: "AI",
        cacheStatus: "HIT",
        provider: cached.provider,
        model: cached.model,
        generatedAt: cached.generatedAt.toISOString(),
      };
    }

    try {
      const adapter = getAIAdapter();
      const output = await adapter.chatWithDietitian({
        context: {},
        history: [],
        message: promptFor(input.scope, input.context),
      });
      const text = sanitizeHistoryInsightText(output.reply).slice(0, MAX_INSIGHT_LENGTH).trim();
      if (!text) throw new Error("History AI returned an empty insight.");

      const stored = await historyRepository.upsertInsight({
        userId: input.userId,
        scope: input.prismaScope,
        periodKey: input.periodKey,
        timezone: input.timezone,
        contextHash,
        content: { text } as Prisma.InputJsonValue,
        source: HistoryInsightSource.AI,
        provider: adapter.info.provider,
        model: adapter.info.model,
        generatedAt: input.generatedAt,
      });

      return {
        scope: input.scope,
        periodKey: input.periodKey,
        timezone: input.timezone,
        content: { text },
        generatedBy: "AI",
        cacheStatus: "MISS",
        provider: stored.provider,
        model: stored.model,
        generatedAt: stored.generatedAt.toISOString(),
      };
    } catch (error) {
      logger.warn(
        { err: error, scope: input.scope, periodKey: input.periodKey },
        "History AI insight unavailable; fallback returned",
      );
      return fallbackResponse(
        input.scope,
        input.periodKey,
        input.timezone,
        false,
        false,
        input.generatedAt,
      );
    }
  })();

  inFlight.set(singleFlightKey, work);
  try {
    return await work;
  } finally {
    inFlight.delete(singleFlightKey);
  }
}

export const historyAiService = {
  async getDailyInsight(
    userId: string,
    date: string,
    timezone: string | undefined,
    now = new Date(),
  ): Promise<HistoryInsightResponse> {
    const bundle = await historyService.getDayWithFingerprint(userId, date, timezone, now);
    return generateAndCache({
      userId,
      scope: "DAY",
      prismaScope: HistoryInsightScope.DAY,
      periodKey: dailyPeriodKey(bundle.history),
      timezone: bundle.history.timezone,
      context: dailyContext(bundle.history),
      sourceFingerprint: bundle.sourceFingerprint,
      partial: bundle.history.meta.partialResponse,
      noData: !hasDailyData(bundle.history),
      generatedAt: now,
    });
  },

  async getPeriodInsight(
    userId: string,
    scope: "WEEK" | "MONTH",
    referenceDate: string,
    timezone: string | undefined,
    now = new Date(),
  ): Promise<HistoryInsightResponse> {
    const bundle = await historyComparisonService.getComparisonWithFingerprint(
      userId,
      scope,
      referenceDate,
      timezone,
      now,
    );
    return generateAndCache({
      userId,
      scope,
      prismaScope: scope === "WEEK" ? HistoryInsightScope.WEEK : HistoryInsightScope.MONTH,
      periodKey: comparisonPeriodKey(scope, bundle.comparison),
      timezone: bundle.comparison.timezone,
      context: periodContext(scope, bundle.comparison),
      sourceFingerprint: bundle.sourceFingerprint,
      partial: bundle.comparison.meta.partialResponse,
      noData: !hasPeriodData(bundle.comparison),
      generatedAt: now,
    });
  },

  async getCustomComparisonInsight(
    userId: string,
    input: {
      period1Start: string;
      period1End: string;
      period2Start: string;
      period2End: string;
    },
    timezone: string | undefined,
    now = new Date(),
  ): Promise<HistoryInsightResponse> {
    const bundle = await historyComparisonService.getCustomComparisonWithFingerprint(
      userId,
      input,
      timezone,
      now,
    );
    return generateAndCache({
      userId,
      scope: "CUSTOM",
      // Reuse the existing persistence enum without a database migration.
      // The CUSTOM prefix and complete range identity keep this cache namespace isolated.
      prismaScope: HistoryInsightScope.WEEK,
      periodKey: comparisonPeriodKey("CUSTOM", bundle.comparison),
      timezone: bundle.comparison.timezone,
      context: periodContext("CUSTOM", bundle.comparison),
      sourceFingerprint: bundle.sourceFingerprint,
      partial: bundle.comparison.meta.partialResponse,
      noData: !hasCustomComparisonData(bundle.comparison),
      generatedAt: now,
    });
  },
};
