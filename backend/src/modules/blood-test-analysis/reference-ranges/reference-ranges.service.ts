import type { BloodTestReferenceRange } from "@prisma/client";

import { ApiError } from "../../../utils/api-error";
import type { AnalysisContext } from "../types";
import type { ReferenceRangeMap } from "../normalization/normalization.service";
import { referenceRangesRepository } from "./reference-ranges.repository";
import type {
  CreateReferenceRangeInput,
  ListRangesQuery,
  UpdateReferenceRangeInput,
} from "./dto/reference-ranges.schemas";

/**
 * Scores how well a range applies to a given context. A higher score means a
 * more specific (better) match. Ranges that are disqualified (wrong gender, out
 * of age band, wrong country) return `null` and are excluded.
 */
function scoreRange(range: BloodTestReferenceRange, context: AnalysisContext): number | null {
  let score = 0;

  const gender = context.gender ?? "ALL";
  if (range.gender !== "ALL") {
    if (range.gender !== gender) return null;
    score += 2;
  }

  if (context.age != null) {
    if (range.ageMin != null && context.age < range.ageMin) return null;
    if (range.ageMax != null && context.age > range.ageMax) return null;
  }
  if (range.ageMin != null || range.ageMax != null) score += 1;

  if (range.country) {
    if (context.country && range.country === context.country) {
      score += 2;
    } else {
      return null;
    }
  }

  if (range.laboratoryId) score += 1;

  return score;
}

/**
 * Service for managing and resolving blood-test reference ranges.
 */
export const referenceRangesService = {
  /**
   * Resolves the single best-matching active reference range per biomarker
   * code for the supplied context.
   *
   * @param codes - Canonical biomarker codes to resolve ranges for.
   * @param context - User context (gender/age/country) driving specificity.
   * @returns A map of code → best matching reference range.
   */
  async getRangeMapForCodes(
    codes: string[],
    context: AnalysisContext,
  ): Promise<ReferenceRangeMap> {
    const map: ReferenceRangeMap = new Map();
    if (codes.length === 0) return map;

    const ranges = await referenceRangesRepository.findActiveByCodes(codes);
    const bestByCode = new Map<string, { range: BloodTestReferenceRange; score: number }>();

    for (const range of ranges) {
      const score = scoreRange(range, context);
      if (score === null) continue;
      const current = bestByCode.get(range.biomarkerCode);
      if (!current || score > current.score) {
        bestByCode.set(range.biomarkerCode, { range, score });
      }
    }

    for (const [code, { range }] of bestByCode.entries()) {
      map.set(code, range);
    }
    return map;
  },

  /** Lists reference ranges with optional filtering. */
  list(query: ListRangesQuery): Promise<BloodTestReferenceRange[]> {
    return referenceRangesRepository.list({
      biomarkerCode: query.biomarkerCode,
      isActive: query.isActive,
    });
  },

  /** Fetches a range by id or throws 404. */
  async getById(id: string): Promise<BloodTestReferenceRange> {
    const range = await referenceRangesRepository.findById(id);
    if (!range) {
      throw ApiError.notFound("Reference range not found.");
    }
    return range;
  },

  /** Creates a new reference range. */
  create(input: CreateReferenceRangeInput): Promise<BloodTestReferenceRange> {
    return referenceRangesRepository.create({
      biomarkerCode: input.biomarkerCode,
      biomarkerName: input.biomarkerName,
      biomarkerNameTr: input.biomarkerNameTr ?? null,
      unit: input.unit,
      minValue: input.minValue ?? null,
      maxValue: input.maxValue ?? null,
      optimalMin: input.optimalMin ?? null,
      optimalMax: input.optimalMax ?? null,
      gender: input.gender,
      ageMin: input.ageMin ?? null,
      ageMax: input.ageMax ?? null,
      country: input.country ?? null,
      laboratoryId: input.laboratoryId ?? null,
      isActive: input.isActive,
      source: input.source,
      notes: input.notes ?? null,
    });
  },

  /** Updates a range or throws 404 when it does not exist. */
  async update(id: string, input: UpdateReferenceRangeInput): Promise<BloodTestReferenceRange> {
    await this.getById(id);
    return referenceRangesRepository.update(id, input);
  },

  /** Deletes a range or throws 404 when it does not exist. */
  async remove(id: string): Promise<void> {
    await this.getById(id);
    await referenceRangesRepository.delete(id);
  },
};
