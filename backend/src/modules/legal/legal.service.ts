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
        !!record &&
        record.granted &&
        record.documentVersion === doc.version;
      return {
        type: doc.type,
        currentVersion: doc.version,
        mandatory: doc.mandatory,
        granted,
        consentedVersion: record?.documentVersion ?? null,
        grantedAt: record?.grantedAt ?? null,
        withdrawnAt: record?.withdrawnAt ?? null,
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
   * Records an affirmative consent for a document. The grant is always stamped
   * with the document's *current* version so a stale client cannot consent to
   * an outdated version.
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
   * Withdraws consent for a document. Mandatory documents may still be
   * withdrawn (KVKK guarantees this right); the platform's consent gate will
   * subsequently block gated actions until consent is re-granted.
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

  /**
   * Returns the mandatory document types the user has NOT granted (up to date).
   * Empty array means all mandatory consents are satisfied. Used by the
   * require-consent middleware.
   */
  async getMissingMandatoryConsents(
    userId: string,
  ): Promise<LegalDocumentType[]> {
    const status = await this.getConsentStatus(userId);
    return status.missingMandatory;
  },

  /** The list of mandatory consent document types. */
  mandatoryConsents(): LegalDocumentType[] {
    return [...MANDATORY_CONSENTS];
  },
};
