import { apiRequest } from "@/infrastructure/api/http-client";

export interface WeeklyReviewFullDto {
  id: string;
  weekNumber: number;
  year: number;
  score: number;
  weightTrend: "IMPROVING" | "STABLE" | "DECLINING";
  mealConsistency: number;
  waterConsistency: number;
  proteinConsistency: number;
  coachComments: string;
  recommendations: unknown;
  nextWeekPriorities: unknown;
  createdAt: string;
}

export interface WeeklyReviewSimplifiedDto {
  weekNumber: number;
  year: number;
  score: number;
  weightTrend: "IMPROVING" | "STABLE" | "DECLINING";
  topRecommendations: string[];
  premiumLocked: true;
}

export type WeeklyReviewDto = WeeklyReviewFullDto | WeeklyReviewSimplifiedDto;

export interface MonthlyReviewDto {
  id: string;
  month: number;
  year: number;
  progressSummary: string;
  habitsAnalysis: string;
  improvements: unknown;
  riskAreas: unknown;
  aiEvaluation: string;
  motivationMessage: string;
  priorities: unknown;
  createdAt: string;
}

export const coachReviewsClient = {
  getWeeklyReview() {
    return apiRequest<{ premium: boolean; review: WeeklyReviewDto }>({
      path: "/ai-coach/weekly-review",
      method: "GET",
      auth: true,
    });
  },

  getMonthlyReview() {
    return apiRequest<{ review: MonthlyReviewDto }>({
      path: "/ai-coach/monthly-review",
      method: "GET",
      auth: true,
    });
  },
} as const;
