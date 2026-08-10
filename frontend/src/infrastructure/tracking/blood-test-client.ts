import { apiRequest } from "@/infrastructure/api/http-client";
import { BLOOD_TEST_ENDPOINTS } from "@/infrastructure/auth/endpoints";

/** Lifecycle status of an AI blood-test analysis run (backend enum). */
export type BloodTestAnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

/**
 * A persisted blood-test analysis record, as returned by the backend
 * blood-test-analysis module. The backend is the single source of truth; the
 * frontend blood-test store is a cache hydrated from these records.
 */
export interface BloodTestAnalysis {
  id: string;
  status: BloodTestAnalysisStatus;
  /** 2–3 sentence plain-language summary (with disclaimer), when available. */
  summary: string | null;
  /** Count of abnormal (out-of-range) biomarkers. */
  abnormalCount: number;
  createdAt: string;
}

/**
 * Infrastructure-level blood-test client. Authenticated (the HTTP client
 * attaches the access token). Reuses the existing `/api/blood-tests/analyses`
 * endpoint — no new backend contract. No UI or store logic here.
 */
export const bloodTestClient = {
  /** Lists the authenticated user's blood-test analyses (newest first). */
  listAnalyses() {
    return apiRequest<{ analyses: BloodTestAnalysis[] }>({
      path: BLOOD_TEST_ENDPOINTS.analyses,
      method: "GET",
      auth: true,
    });
  },
} as const;
