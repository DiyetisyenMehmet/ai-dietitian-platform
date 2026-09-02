import { apiRequest } from "@/infrastructure/api/http-client";
import { BLOOD_TEST_ENDPOINTS } from "@/infrastructure/auth/endpoints";

/** Lifecycle status of an AI blood-test analysis run (backend enum). */
export type BloodTestAnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

/** Minimal upload metadata returned by POST /blood-tests. */
export interface BloodTestUpload {
  id: string;
  status: "UPLOADED" | "ANALYZING" | "ANALYZED" | "FAILED";
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
}

/**
 * A persisted blood-test analysis record, as returned by the backend
 * blood-test-analysis module. The backend is the single source of truth; the
 * frontend blood-test store is a cache hydrated from these records.
 */
export interface BloodTestAnalysis {
  id: string;
  bloodTestId: string;
  status: BloodTestAnalysisStatus;
  /** 2–3 sentence plain-language summary (with disclaimer), when available. */
  summary: string | null;
  /** Count of abnormal (out-of-range) biomarkers. */
  abnormalCount: number;
  /** Safe operational failure text persisted by the backend, when available. */
  errorMessage?: string | null;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Infrastructure-level blood-test client. Uploads use multipart/form-data;
 * analysis and history calls are authenticated JSON requests.
 */
export const bloodTestClient = {
  /** Uploads a PDF/JPG/PNG to the authenticated user's blood-test storage. */
  upload(file: File) {
    const form = new FormData();
    form.append("file", file, file.name);
    return apiRequest<{ upload: BloodTestUpload }>({
      path: "/blood-tests",
      method: "POST",
      auth: true,
      body: form,
    });
  },

  /** Runs the synchronous validation/extraction/AI analysis pipeline. */
  analyze(uploadId: string) {
    return apiRequest<{ analysis: BloodTestAnalysis }>({
      path: `/blood-tests/${encodeURIComponent(uploadId)}/analyze`,
      method: "POST",
      auth: true,
    });
  },

  /** Lists the authenticated user's blood-test analyses (newest first). */
  listAnalyses() {
    return apiRequest<{ analyses: BloodTestAnalysis[] }>({
      path: BLOOD_TEST_ENDPOINTS.analyses,
      method: "GET",
      auth: true,
    });
  },

  /** Deletes the stored upload; its one-to-one analysis cascades server-side. */
  removeUpload(uploadId: string) {
    return apiRequest<{ message: string }>({
      path: `/blood-tests/${encodeURIComponent(uploadId)}`,
      method: "DELETE",
      auth: true,
    });
  },
} as const;
