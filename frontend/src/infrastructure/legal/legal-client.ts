import { apiRequest } from "@/infrastructure/api/http-client";
import type {
  ConsentStatusItem,
  ConsentStatusView,
  LegalDocumentSummary,
  LegalDocumentType,
  LegalDocumentView,
} from "@/domain/legal/types";

const BASE = "/legal";

interface LegalDocumentEnvelope {
  document: LegalDocumentView;
}

export const legalClient = {
  listDocuments(): Promise<{ documents: LegalDocumentSummary[] }> {
    return apiRequest<{ documents: LegalDocumentSummary[] }>({
      path: `${BASE}/documents`,
      method: "GET",
    });
  },

  async getDocument(type: LegalDocumentType): Promise<LegalDocumentView> {
    const { document } = await apiRequest<LegalDocumentEnvelope>({
      path: `${BASE}/documents/${type}`,
      method: "GET",
    });
    return document;
  },

  getConsents(): Promise<ConsentStatusView> {
    return apiRequest<ConsentStatusView>({
      path: `${BASE}/consents`,
      method: "GET",
      auth: true,
    });
  },

  grantConsent(type: LegalDocumentType): Promise<ConsentStatusItem> {
    return apiRequest<ConsentStatusItem>({
      path: `${BASE}/consents`,
      method: "POST",
      auth: true,
      body: JSON.stringify({ type }),
    });
  },

  withdrawConsent(type: LegalDocumentType): Promise<ConsentStatusItem> {
    return apiRequest<ConsentStatusItem>({
      path: `${BASE}/consents/withdraw`,
      method: "POST",
      auth: true,
      body: JSON.stringify({ type }),
    });
  },
} as const;
