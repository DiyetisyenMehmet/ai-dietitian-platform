import { apiRequest } from "@/infrastructure/api/http-client";
import { SLEEP_ENDPOINTS } from "@/infrastructure/auth/endpoints";

export interface SleepLog {
  id: string;
  userId: string;
  sleepStart: string;
  wakeTime: string;
  durationMinutes: number;
  quality: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailySleepAssessment {
  date: string;
  totalDurationMinutes: number;
  averageQuality: number | null;
  entries: number;
  status: "NO_DATA" | "INSUFFICIENT" | "GOOD" | "EXCESSIVE";
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

export interface SleepAiComment {
  comment: string;
  generatedBy: "AI" | "FALLBACK";
  provider: string | null;
  model: string | null;
}

export interface SaveSleepInput {
  sleepStart: string;
  wakeTime: string;
  quality: number;
  note?: string;
}

function analysisQuery(dateKey: "date" | "endDate", date: string): string {
  const offset = new Date().getTimezoneOffset();
  return `?${dateKey}=${encodeURIComponent(date)}&timezoneOffsetMinutes=${encodeURIComponent(String(offset))}`;
}

export const sleepClient = {
  list(since?: Date) {
    const query = since ? `?since=${encodeURIComponent(since.toISOString())}` : "";
    return apiRequest<{ sleeps: SleepLog[] }>({
      path: `${SLEEP_ENDPOINTS.base}${query}`,
      method: "GET",
      auth: true,
    });
  },

  create(input: SaveSleepInput) {
    return apiRequest<{ sleep: SleepLog }>({
      path: SLEEP_ENDPOINTS.base,
      method: "POST",
      auth: true,
      body: JSON.stringify(input),
    });
  },

  update(id: string, input: Partial<SaveSleepInput>) {
    return apiRequest<{ sleep: SleepLog }>({
      path: `${SLEEP_ENDPOINTS.base}/${encodeURIComponent(id)}`,
      method: "PATCH",
      auth: true,
      body: JSON.stringify(input),
    });
  },

  remove(id: string) {
    return apiRequest<void>({
      path: `${SLEEP_ENDPOINTS.base}/${encodeURIComponent(id)}`,
      method: "DELETE",
      auth: true,
    });
  },

  dailyAssessment(date: string) {
    return apiRequest<{ assessment: DailySleepAssessment }>({
      path: `${SLEEP_ENDPOINTS.dailyAssessment}${analysisQuery("date", date)}`,
      method: "GET",
      auth: true,
    });
  },

  weeklyAnalysis(endDate: string) {
    return apiRequest<{ analysis: WeeklySleepAnalysis }>({
      path: `${SLEEP_ENDPOINTS.weeklyAnalysis}${analysisQuery("endDate", endDate)}`,
      method: "GET",
      auth: true,
    });
  },

  aiComment(endDate: string) {
    return apiRequest<SleepAiComment>({
      path: `${SLEEP_ENDPOINTS.aiComment}${analysisQuery("endDate", endDate)}`,
      method: "POST",
      auth: true,
    });
  },
} as const;
