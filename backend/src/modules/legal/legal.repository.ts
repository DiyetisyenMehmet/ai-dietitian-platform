import type { ConsentRecord, LegalDocumentType } from "@prisma/client";

import { prisma } from "../../lib/prisma";

/**
 * Data-access layer for legal consent records. Consent is modeled as an
 * append-only history: every grant/withdrawal is a new row, and the "current"
 * state for a (user, type) pair is the most recent record. This preserves a
 * full audit trail of what the user agreed to and when.
 */
export const legalRepository = {
  /** Returns the latest consent record for each mandatory/known document type. */
  async findLatestPerType(userId: string): Promise<ConsentRecord[]> {
    // Fetch newest-first, then keep the first occurrence per type in JS. The
    // per-user volume is tiny, so this is cheaper and clearer than a lateral
    // join or window function.
    const rows = await prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    const latest = new Map<LegalDocumentType, ConsentRecord>();
    for (const row of rows) {
      if (!latest.has(row.type)) latest.set(row.type, row);
    }
    return [...latest.values()];
  },

  /** Returns the latest consent record for a single document type. */
  async findLatestForType(
    userId: string,
    type: LegalDocumentType,
  ): Promise<ConsentRecord | null> {
    return prisma.consentRecord.findFirst({
      where: { userId, type },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Records an affirmative grant for a document version. */
  async recordGrant(input: {
    userId: string;
    type: LegalDocumentType;
    documentVersion: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<ConsentRecord> {
    return prisma.consentRecord.create({
      data: {
        userId: input.userId,
        type: input.type,
        documentVersion: input.documentVersion,
        granted: true,
        grantedAt: new Date(),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  },

  /** Records a withdrawal of consent for a document version. */
  async recordWithdrawal(input: {
    userId: string;
    type: LegalDocumentType;
    documentVersion: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<ConsentRecord> {
    return prisma.consentRecord.create({
      data: {
        userId: input.userId,
        type: input.type,
        documentVersion: input.documentVersion,
        granted: false,
        withdrawnAt: new Date(),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  },
};
