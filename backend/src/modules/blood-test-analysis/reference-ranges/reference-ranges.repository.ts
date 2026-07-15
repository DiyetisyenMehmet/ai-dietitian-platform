import type { BloodTestReferenceRange, Prisma } from "@prisma/client";

import { prisma } from "../../../lib/prisma";

/**
 * Data-access layer for blood-test reference ranges. Reference ranges are
 * global (not user-scoped) reference data managed by administrators.
 */
export const referenceRangesRepository = {
  /** Lists ranges, optionally filtered by code/active flag. */
  list(filter: { biomarkerCode?: string; isActive?: boolean }): Promise<BloodTestReferenceRange[]> {
    return prisma.bloodTestReferenceRange.findMany({
      where: {
        ...(filter.biomarkerCode ? { biomarkerCode: filter.biomarkerCode } : {}),
        ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
      },
      orderBy: [{ biomarkerCode: "asc" }, { createdAt: "asc" }],
    });
  },

  /** Fetches a single range by id. */
  findById(id: string): Promise<BloodTestReferenceRange | null> {
    return prisma.bloodTestReferenceRange.findUnique({ where: { id } });
  },

  /** Returns all active ranges for the given biomarker codes. */
  findActiveByCodes(codes: string[]): Promise<BloodTestReferenceRange[]> {
    return prisma.bloodTestReferenceRange.findMany({
      where: { isActive: true, biomarkerCode: { in: codes } },
    });
  },

  /** Creates a new reference range. */
  create(data: Prisma.BloodTestReferenceRangeCreateInput): Promise<BloodTestReferenceRange> {
    return prisma.bloodTestReferenceRange.create({ data });
  },

  /** Updates an existing reference range. */
  update(
    id: string,
    data: Prisma.BloodTestReferenceRangeUpdateInput,
  ): Promise<BloodTestReferenceRange> {
    return prisma.bloodTestReferenceRange.update({ where: { id }, data });
  },

  /** Deletes a reference range. */
  delete(id: string): Promise<BloodTestReferenceRange> {
    return prisma.bloodTestReferenceRange.delete({ where: { id } });
  },
};
