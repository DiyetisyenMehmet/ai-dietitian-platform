import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { getAIAdapter } from "../blood-test-analysis/ai-adapter/ai-adapter.factory";
import { sleepRepository, type SleepLogRecord } from "./sleep.repository";
import type { CreateSleepInput, UpdateSleepInput } from "./sleep.schemas";

const MIN_SLEEP_MINUTES = 15;
const MAX_SLEEP_MINUTES = 24 * 60;
const TARGET_MIN_MINUTES = 7 * 60;
const TARGET_MAX_MINUTES = 9 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DailySleepStatus = "NO_DATA" | "INSUFFICIENT" | "GOOD" | "EXCESSIVE";

export interface DailySleepAssessment {
  date: string;
  totalDurationMinutes: number;
  averageQuality: number | null;
  entries: number;
  status: DailySleepStatus;
  assessment: string;
}

export interface WeeklySleepAnalysis {
  from: string;
  to: string;
  nightsLogged: number;
  averageDurationMinutes: number | null;
  averageQuality: number | null;
  targetNights: number;
  targetRatePercent: number;
  bedtimeStandardDeviationMinutes: number | null;
  regularityScore: number | null;
  sleepScore: number | null;
  assessment: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function validateWindow(sleepStart: Date, wakeTime: Date): number {
  const durationMinutes = Math.round((wakeTime.getTime() - sleepStart.getTime()) / 60_000);
  if (!Number.isFinite(durationMinutes) || durationMinutes < MIN_SLEEP_MINUTES) {
    throw ApiError.badRequest("Wake time must be at least 15 minutes after sleep start.");
  }
  if (durationMinutes > MAX_SLEEP_MINUTES) {
    throw ApiError.badRequest("A sleep entry cannot exceed 24 hours.");
  }
  return durationMinutes;
}

function dateRange(date: string, timezoneOffsetMinutes: number): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw ApiError.badRequest("date must use YYYY-MM-DD format.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const check = new Date(utcMidnight);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw ApiError.badRequest("date is not a valid calendar date.");
  }
  const from = new Date(utcMidnight + timezoneOffsetMinutes * 60_000);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

function dateLabel(date: Date, timezoneOffsetMinutes: number): string {
  const shifted = new Date(date.getTime() - timezoneOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function dailyAssessment(date: string, logs: SleepLogRecord[]): DailySleepAssessment {
  const total = logs.reduce((sum, log) => sum + log.durationMinutes, 0);
  const quality = average(logs.map((log) => log.quality));
  let status: DailySleepStatus = "NO_DATA";
  let assessment = "Bu gün için uyku kaydı bulunmuyor.";
  if (logs.length > 0 && total < TARGET_MIN_MINUTES) {
    status = "INSUFFICIENT";
    assessment = "Toplam uyku süren hedeflenen 7–9 saat aralığının altında.";
  } else if (logs.length > 0 && total <= TARGET_MAX_MINUTES) {
    status = "GOOD";
    assessment = "Toplam uyku süren hedeflenen 7–9 saat aralığında.";
  } else if (logs.length > 0) {
    status = "EXCESSIVE";
    assessment = "Toplam uyku süren hedeflenen 7–9 saat aralığının üzerinde.";
  }
  return {
    date,
    totalDurationMinutes: total,
    averageQuality: quality === null ? null : round1(quality),
    entries: logs.length,
    status,
    assessment,
  };
}

function bedtimeMinutes(log: SleepLogRecord, timezoneOffsetMinutes: number): number {
  const local = new Date(log.sleepStart.getTime() - timezoneOffsetMinutes * 60_000);
  let minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutes < 12 * 60) minutes += 24 * 60;
  return minutes;
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function buildWeeklyAnalysis(
  from: Date,
  to: Date,
  timezoneOffsetMinutes: number,
  logs: SleepLogRecord[],
): WeeklySleepAnalysis {
  const durations = logs.map((log) => log.durationMinutes);
  const qualities = logs.map((log) => log.quality);
  const targetNights = logs.filter(
    (log) => log.durationMinutes >= TARGET_MIN_MINUTES && log.durationMinutes <= TARGET_MAX_MINUTES,
  ).length;
  const bedtimeSd = standardDeviation(logs.map((log) => bedtimeMinutes(log, timezoneOffsetMinutes)));
  const regularityScore = bedtimeSd === null
    ? null
    : Math.max(0, Math.round(100 - Math.min(100, bedtimeSd / 1.8)));
  const averageDuration = average(durations);
  const averageQuality = average(qualities);
  const durationScore = averageDuration === null
    ? null
    : Math.max(0, Math.round(100 - Math.min(100, Math.abs(480 - averageDuration) / 2.4)));
  const qualityScore = averageQuality === null ? null : Math.round((averageQuality / 5) * 100);
  const completenessScore = Math.min(100, Math.round((logs.length / 7) * 100));
  const scoreParts = [durationScore, qualityScore, regularityScore, completenessScore].filter(
    (value): value is number => value !== null,
  );
  const sleepScore = scoreParts.length
    ? Math.round(scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length)
    : null;

  let assessment = "Haftalık değerlendirme için henüz uyku kaydı bulunmuyor.";
  if (logs.length > 0) {
    const targetRate = Math.round((targetNights / logs.length) * 100);
    if (targetRate >= 70 && (averageQuality ?? 0) >= 3.5) {
      assessment = "Bu haftaki uyku süresi ve öznel kalite genel olarak dengeli görünüyor.";
    } else if ((averageDuration ?? 0) < TARGET_MIN_MINUTES) {
      assessment = "Bu hafta ortalama uyku süresi 7 saatin altında kaldı; düzenli bir uyku penceresi oluşturmaya odaklanabilirsin.";
    } else {
      assessment = "Bu hafta uyku düzeninde geliştirilebilecek alanlar var; süre, kalite ve yatış saati tutarlılığını birlikte izle.";
    }
  }

  return {
    from: dateLabel(from, timezoneOffsetMinutes),
    to: dateLabel(new Date(to.getTime() - 1), timezoneOffsetMinutes),
    nightsLogged: logs.length,
    averageDurationMinutes: averageDuration === null ? null : Math.round(averageDuration),
    averageQuality: averageQuality === null ? null : round1(averageQuality),
    targetNights,
    targetRatePercent: logs.length ? Math.round((targetNights / logs.length) * 100) : 0,
    bedtimeStandardDeviationMinutes: bedtimeSd === null ? null : Math.round(bedtimeSd),
    regularityScore,
    sleepScore,
    assessment,
  };
}

function safeOffset(value: number): number {
  if (!Number.isFinite(value) || value < -840 || value > 840) {
    throw ApiError.badRequest("timezoneOffsetMinutes must be between -840 and 840.");
  }
  return Math.trunc(value);
}

async function weeklyAnalysisForUser(
  userId: string,
  endDate: string,
  timezoneOffsetMinutes = 0,
): Promise<WeeklySleepAnalysis> {
  const offset = safeOffset(timezoneOffsetMinutes);
  const { to } = dateRange(endDate, offset);
  const from = new Date(to.getTime() - 7 * DAY_MS);
  const logs = await sleepRepository.listRange(userId, from, to);
  return buildWeeklyAnalysis(from, to, offset, logs);
}

export const sleepService = {
  async create(userId: string, input: CreateSleepInput): Promise<SleepLogRecord> {
    const sleepStart = new Date(input.sleepStart);
    const wakeTime = new Date(input.wakeTime);
    const durationMinutes = validateWindow(sleepStart, wakeTime);
    return sleepRepository.create({ ...input, userId, sleepStart, wakeTime, durationMinutes });
  },

  list(userId: string, since?: Date): Promise<SleepLogRecord[]> {
    return sleepRepository.list(userId, since);
  },

  async update(userId: string, id: string, input: UpdateSleepInput): Promise<SleepLogRecord> {
    const existing = await sleepRepository.findById(userId, id);
    if (!existing) throw ApiError.notFound("Sleep entry not found.");
    const sleepStart = input.sleepStart ? new Date(input.sleepStart) : existing.sleepStart;
    const wakeTime = input.wakeTime ? new Date(input.wakeTime) : existing.wakeTime;
    const durationMinutes = validateWindow(sleepStart, wakeTime);
    const updated = await sleepRepository.update({
      id,
      userId,
      sleepStart,
      wakeTime,
      durationMinutes,
      quality: input.quality ?? existing.quality,
      note: input.note ?? existing.note ?? undefined,
    });
    if (!updated) throw ApiError.notFound("Sleep entry not found.");
    return updated;
  },

  remove(userId: string, id: string): Promise<void> {
    return sleepRepository.remove(userId, id);
  },

  async getDailyAssessment(
    userId: string,
    date: string,
    timezoneOffsetMinutes = 0,
  ): Promise<DailySleepAssessment> {
    const offset = safeOffset(timezoneOffsetMinutes);
    const { from, to } = dateRange(date, offset);
    const logs = await sleepRepository.listRange(userId, from, to);
    return dailyAssessment(date, logs);
  },

  getWeeklyAnalysis(
    userId: string,
    endDate: string,
    timezoneOffsetMinutes = 0,
  ): Promise<WeeklySleepAnalysis> {
    return weeklyAnalysisForUser(userId, endDate, timezoneOffsetMinutes);
  },

  async generateAiComment(
    userId: string,
    endDate: string,
    timezoneOffsetMinutes = 0,
  ): Promise<{ comment: string; generatedBy: "AI" | "FALLBACK"; provider: string | null; model: string | null }> {
    const analysis = await weeklyAnalysisForUser(userId, endDate, timezoneOffsetMinutes);
    if (analysis.nightsLogged === 0) {
      return {
        comment: "AI yorumu için önce en az bir uyku kaydı eklemelisin.",
        generatedBy: "FALLBACK",
        provider: null,
        model: null,
      };
    }

    try {
      const adapter = getAIAdapter();
      const output = await adapter.chatWithDietitian({
        context: {},
        history: [],
        message: [
          "Aşağıdaki anonimleştirilmiş 7 günlük uyku özetine göre Türkçe, kısa ve destekleyici bir genel iyi oluş yorumu yaz.",
          "Tanı, tedavi, ilaç veya kesin tıbbi sonuç verme. Ölçülmeyen veri uydurma. En fazla 3 cümle kullan.",
          `Kayıtlı gece: ${analysis.nightsLogged}/7`,
          `Ortalama süre (dk): ${analysis.averageDurationMinutes ?? "yok"}`,
          `Ortalama öznel kalite (1-5): ${analysis.averageQuality ?? "yok"}`,
          `7-9 saat hedefindeki gece: ${analysis.targetNights}`,
          `Yatış saati sapması (dk): ${analysis.bedtimeStandardDeviationMinutes ?? "yetersiz veri"}`,
          `Uyku skoru: ${analysis.sleepScore ?? "yok"}/100`,
        ].join("\n"),
      });
      return {
        comment: output.reply.trim(),
        generatedBy: "AI",
        provider: adapter.info.provider,
        model: adapter.info.model,
      };
    } catch (error) {
      logger.warn({ err: error, userId }, "Sleep AI comment unavailable; deterministic fallback returned");
      return {
        comment: analysis.assessment,
        generatedBy: "FALLBACK",
        provider: null,
        model: null,
      };
    }
  },
};
