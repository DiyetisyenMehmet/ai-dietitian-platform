export type LegalDocumentType =
  | "PRIVACY_POLICY"
  | "TERMS_OF_SERVICE"
  | "MEDICAL_DISCLAIMER"
  | "KVKK_EXPLICIT_CONSENT";

export interface LegalDocumentSummary {
  type: LegalDocumentType;
  version: string;
  title: string;
  mandatory: boolean;
}

export interface LegalDocumentView extends LegalDocumentSummary {
  body: string;
}

export interface ConsentStatusItem {
  type: LegalDocumentType;
  currentVersion: string;
  mandatory: boolean;
  granted: boolean;
  consentedVersion: string | null;
  grantedAt: string | null;
  withdrawnAt: string | null;
}

export interface ConsentStatusView {
  items: ConsentStatusItem[];
  allMandatoryGranted: boolean;
  missingMandatory: LegalDocumentType[];
}
