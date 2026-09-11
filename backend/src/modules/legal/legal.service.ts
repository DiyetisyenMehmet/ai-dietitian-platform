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

/** Business logic for versioned legal documents and user consent. */
export const legalService = {
  listDocuments(): LegalDocumentSummary[] {
    return LEGAL_DOCUMENTS.map((doc) => ({
      type: doc.type,
      version: doc.version,
      title: doc.title,
      mandatory: doc.mandatory,
      consentable: doc.consentable,
    }));
  },

  getDocument(type: LegalDocumentType): LegalDocumentView {
    const doc = LEGAL_DOCUMENT_BY_TYPE[type];
    if (!doc) throw ApiError.notFound("Legal document not found.");
    return {
      type: doc.type,
      version: doc.version,
      title: doc.title,
      mandatory: doc.mandatory,
      consentable: doc.consentable,
      body: doc.body,
    };
  },

  async getConsentStatus(userId: string): Promise<ConsentStatusView> {
    const latest = await legalRepository.findLatestPerType(userId);
    const latestByType = new Map(latest.map((record) => [record.type, record]));

    const items: ConsentStatusItem[] = LEGAL_DOCUMENTS.map((doc) => {
      const record = latestByType.get(doc.type);
      const granted =
        doc.consentable &&
        !!record &&
        record.granted &&
        record.documentVersion === doc.version;
      return {
        type: doc.type,
        currentVersion: doc.version,
        mandatory: doc.mandatory,
        consentable: doc.consentable,
        granted,
        consentedVersion: doc.consentable ? record?.documentVersion ?? null : null,
        grantedAt: doc.consentable ? record?.grantedAt ?? null : null,
        withdrawnAt: doc.consentable ? record?.withdrawnAt ?? null : null,
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

  async grantConsent(
    userId: string,
    type: LegalDocumentType,
    context: AuditContext,
  ): Promise<ConsentStatusItem> {
    const doc = LEGAL_DOCUMENT_BY_TYPE[type];
    if (!doc) throw ApiError.notFound("Legal document not found.");
    if (!doc.consentable) {
      throw ApiError.badRequest(
        "This legal document is informational and does not accept consent actions.",
      );
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
      consentable: doc.consentable,
      granted: true,
      consentedVersion: doc.version,
      grantedAt: new Date(),
      withdrawnAt: null,
    };
  },

  async withdrawConsent(
    userId: string,
    type: LegalDocumentType,
    context: AuditContext,
  ): Promise<ConsentStatusItem> {
    const doc = LEGAL_DOCUMENT_BY_TYPE[type];
    if (!doc) throw ApiError.notFound("Legal document not found.");
    if (!doc.consentable) {
      throw ApiError.badRequest(
        "This legal document is informational and cannot be withdrawn.",
      );
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
      consentable: doc.consentable,
      granted: false,
      consentedVersion: doc.version,
      grantedAt: null,
      withdrawnAt: new Date(),
    };
  },

  /** Returns missing global consents plus any feature-specific consent types. */
  async getMissingConsents(
    userId: string,
    requiredTypes: LegalDocumentType[] = [],
  ): Promise<LegalDocumentType[]> {
    const status = await this.getConsentStatus(userId);
    const required = new Set<LegalDocumentType>([
      ...MANDATORY_CONSENTS,
      ...requiredTypes,
    ]);
    return status.items
      .filter((item) => required.has(item.type) && !item.granted)
      .map((item) => item.type);
  },

  async getMissingMandatoryConsents(userId: string): Promise<LegalDocumentType[]> {
    return this.getMissingConsents(userId);
  },

  mandatoryConsents(): LegalDocumentType[] {
    return MANDATORY_CONSENTS;
  },
};
