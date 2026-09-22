import { apiRequest } from "@/infrastructure/api/http-client";
import type { CustomHistoryComparisonInput } from "@/application/history/history-custom-comparison";
import { HISTORY_ENDPOINTS } from "@/infrastructure/auth/endpoints";
import type {
  DailyHistoryResponse,
  HistoryComparisonResponse,
  HistoryInsightResponse,
  HistoryMode,
} from "@/domain/history/types";

function params(values: Record<string, string>): string {
  return new URLSearchParams(values).toString();
}

export const historyClient = {
  getDay(date: string, timezone: string) {
    return apiRequest<{ history: DailyHistoryResponse }>({
      path: `${HISTORY_ENDPOINTS.day}?${params({ date, timezone })}`,
      method: "GET",
      auth: true,
    });
  },

  getComparison(period: "week" | "month", referenceDate: string, timezone: string) {
    return apiRequest<{ comparison: HistoryComparisonResponse }>({
      path: `${HISTORY_ENDPOINTS.comparison}?${params({ period, referenceDate, timezone })}`,
      method: "GET",
      auth: true,
    });
  },

  getCustomComparison(input: CustomHistoryComparisonInput, timezone: string) {
    return apiRequest<{ comparison: HistoryComparisonResponse }>({
      path: `${HISTORY_ENDPOINTS.comparison}?${params({
        mode: "custom",
        ...input,
        timezone,
      })}`,
      method: "GET",
      auth: true,
    });
  },

  getInsight(scope: HistoryMode, date: string, timezone: string) {
    return apiRequest<{ insight: HistoryInsightResponse }>({
      path: HISTORY_ENDPOINTS.insight,
      method: "POST",
      auth: true,
      body: JSON.stringify(
        scope === "DAY"
          ? { scope, date, timezone }
          : { scope, referenceDate: date, timezone },
      ),
    });
  },

  getCustomInsight(input: CustomHistoryComparisonInput, timezone: string) {
    return apiRequest<{ insight: HistoryInsightResponse }>({
      path: HISTORY_ENDPOINTS.insight,
      method: "POST",
      auth: true,
      body: JSON.stringify({
        scope: "CUSTOM",
        ...input,
        timezone,
      }),
    });
  },
} as const;
