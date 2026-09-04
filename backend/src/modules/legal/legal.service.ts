import type { LegalDocumentType } from "@prisma/client";

import { recordAudit, type AuditContext } from "../../lib/audit";
import { ApiError } from "../../utils/api-error";
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_BY_TYPE,
  MANDATORY_CONSENTS,
} from "./constants";
import { legalRepository } from "./legal.repository";
import type {
  ConsentStatusItem,
  ConsentStatusView,
  LegalDocumentSummary,
  LegalDocumentView,
} from "./types";

/**
 * Business logic for legal documents and user consent (Sprint 15).
 *
 * Consent is versioned: a grant only counts while the version the user agreed
 * to matches the document's current version. When legal bumps a document
 * version, previously-granted consent is considered stale and the mandatory
 * consent gate re-triggers, forcing re-acceptance.
 */
export const legalService = {
  /** Lists all legal documents (metadata only, no body). */
  listDocuments(): LegalDocumentSummary[] {
    return LEGAL_DOCUMENTS.map((doc) => ({
      type: doc.type,
      version: doc.version,
      title: doc.title,
      mandatory: doc.mandatory,
    }));
  },

  /** Returns a single legal document including its body. */
  getDocument(type: LegalDocumentType): LegalDocumentView {
    const doc = LEGAL_DOCUMENT_BY_TYPE[type];
    if (!doc) {
      throw ApiError.notFound("Legal document not found.");
    }
    return {
      type: doc.type,
      version: doc.version,
      title: doc.title,
      mandatory: doc.mandatory,
      body: doc.body,
    };
  },

  /** Builds the consent-status view for a user across all document types. */
  async getConsentStatus(userId: string): Promise<ConsentStatusView> {
    const latest = await legalRepository.findLatestPerType(userId);
    const latestByType = new Map(latest.map((r) => [r.type, r]));

    const items: ConsentStatusItem[] = LEGAL_DOCUMENTS.map((doc) => {
      const record = latestByType.get(doc.type);
      const granted =
        doc.mandatory &&
        !!record &&
        record.granted &&
        record.documentVersion === doc.version;
      return {
        type: doc.type,
        currentVersion: doc.version,
        mandatory: doc.mandatory,
        granted,
        consentedVersion: doc.mandatory ? record?.documentVersion ?? null : null,
        grantedAt: doc.mandatory ? record?.grantedAt ?? null : null,
        withdrawnAt: doc.mandatory ? record?.withdrawnAt ?? null : null,
      };
    });

    const missingMandatory = items
      .filter((item) => item.mandatory && !item.granted)
      .map((item) => item.type);

    return {
      items,
      allMandatoryGranted: missingMandatory.length === 0,
      missingMandatory,
    };
  },

  /**
   * Records an affirmative consent for a document. Informational notices such
   * as the KVKK/privacy illumination text are deliberately not consentable.
   */
  async grantConsent(
    userId: string,
    type: LegalDocumentType,
    context: AuditContext,
  ): Promise<ConsentStatusItem> {
    const doc = LEGAL_DOCUMENT_BY_TYPE[type];
    if (!doc) {
      throw ApiError.notFound("Legal document not found.");
    }
    if (!doc.mandatory) {
      throw ApiError.badRequest("This legal document is informational and does not accept consent actions.");
    }

    await legalRepository.recordGrant({
      userId,
      type,
      documentVersion: doc.version,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    await recordAudit({
      action: "CONSENT_GRANTED",
      userId,
      context,
      metadata: { type, documentVersion: doc.version },
    });

    return {
      type: doc.type,
      currentVersion: doc.version,
      mandatory: doc.mandatory,
      granted: true,
      consentedVersion: doc.version,
      grantedAt: new Date(),
      withdrawnAt: null,
    };
  },

  /**
   * Withdraws consent for an actual consent document. Informational notices do
   * not represent a permission and therefore cannot be withdrawn.
   */
  async withdrawConsent(
    userId: string,
    type: LegalDocumentType,
    context: AuditContext,
  ): Promise<ConsentStatusItem> {
    const doc = LEGAL_DOCUMENT_BY_TYPE[type];
    if (!doc) {
      throw ApiError.notFound("Legal document not found.");
    }
    if (!doc.mandatory) {
      throw ApiError.badRequest("This legal document is informational and cannot be withdrawn.");
    }

    await legalRepository.recordWithdrawal({
      userId,
      type,
      documentVersion: doc.version,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    await recordAudit({
      action: "CONSENT_WITHDRAWN",
      userId,
      context,
      metadata: { type, documentVersion: doc.version },
    });

    return {
      type: doc.type,
      currentVersion: doc.version,
      mandatory: doc.mandatory,
      granted: false,
      consentedVersion: doc.version,
      grantedAt: null,
      withdrawnAt: new Date(),
    };
  },

  async getMissingMandatoryConsents(userId: string): Promise<LegalDocumentType[]> {
    const status = await this.getConsentStatus(userId);
    return status.missingMandatory;
  },

  mandatoryConsents(): LegalDocumentType[] {
    return MANDATORY_CONSENTS;
  },
};
