import type { LegalDocumentType } from "@prisma/client";

/** Public metadata for a legal document (list view — body omitted). */
export interface LegalDocumentSummary {
  type: LegalDocumentType;
  version: string;
  title: string;
  mandatory: boolean;
}

/** Full legal document including its body. */
export interface LegalDocumentView extends LegalDocumentSummary {
  body: string;
}

/** Consent state for a single document type for a given user. */
export interface ConsentStatusItem {
  type: LegalDocumentType;
  /** The current (latest) document version. */
  currentVersion: string;
  mandatory: boolean;
  /** Whether the user has an active grant for the current version. */
  granted: boolean;
  /** The version the user last acted on, if any. */
  consentedVersion: string | null;
  grantedAt: Date | null;
  withdrawnAt: Date | null;
}

/** Aggregate consent view returned to the client for gating decisions. */
export interface ConsentStatusView {
  items: ConsentStatusItem[];
  /** True when every mandatory document has an active grant for its current version. */
  allMandatoryGranted: boolean;
  /** Mandatory document types still missing an up-to-date grant. */
  missingMandatory: LegalDocumentType[];
}
