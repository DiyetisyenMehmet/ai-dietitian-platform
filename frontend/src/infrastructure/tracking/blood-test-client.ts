import { apiRequest } from "@/infrastructure/api/http-client";
import { BLOOD_TEST_ENDPOINTS } from "@/infrastructure/auth/endpoints";

/** Lifecycle status of an AI blood-test analysis run (backend enum). */
export type BloodTestAnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface BloodTestUpload {
  id: string;
  status: "UPLOADED" | "ANALYZING" | "ANALYZED" | "FAILED";
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
}

export interface BloodTestAnalysis {
  id: string;
  bloodTestId: string;
  status: BloodTestAnalysisStatus;
  summary: string | null;
  abnormalCount: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt?: string;
}

function uploadForm(file: File): FormData {
  const form = new FormData();
  form.append("file", file, file.name);
  return form;
}

export const bloodTestClient = {
  /** Preferred browser flow: upload and analyze on the same backend request/instance. */
  uploadAndAnalyze(file: File) {
    return apiRequest<{ upload: BloodTestUpload; analysis: BloodTestAnalysis }>({
      path: "/blood-tests/analyze-upload",
      method: "POST",
      auth: true,
      body: uploadForm(file),
    });
  },

  /** Upload-only endpoint kept for lower-level workflows. */
  upload(file: File) {
    return apiRequest<{ upload: BloodTestUpload }>({
      path: "/blood-tests",
      method: "POST",
      auth: true,
      body: uploadForm(file),
    });
  },

  analyze(uploadId: string) {
    return apiRequest<{ analysis: BloodTestAnalysis }>({
      path: `/blood-tests/${encodeURIComponent(uploadId)}/analyze`,
      method: "POST",
      auth: true,
    });
  },

  listAnalyses() {
    return apiRequest<{ analyses: BloodTestAnalysis[] }>({
      path: BLOOD_TEST_ENDPOINTS.analyses,
      method: "GET",
      auth: true,
    });
  },

  removeUpload(uploadId: string) {
    return apiRequest<{ message: string }>({
      path: `/blood-tests/${encodeURIComponent(uploadId)}`,
      method: "DELETE",
      auth: true,
    });
  },
} as const;
