import { z } from "zod";

/**
 * Zod DTO schemas for the reference-ranges admin API. These mirror the
 * `BloodTestReferenceRange` model and are used by the `validate` middleware to
 * parse/validate incoming requests before they reach the controller.
 */

/** Allowed gender scopes (mirrors the Prisma `ReferenceRangeGender` enum). */
export const referenceRangeGenderEnum = z.enum(["MALE", "FEMALE", "ALL"]);

/** Route param: reference-range id (UUID). */
export const rangeIdParamSchema = z.object({
  id: z.string().uuid("A valid reference-range id is required"),
});

/** Query filter for listing ranges. */
export const listRangesQuerySchema = z.object({
  biomarkerCode: z.string().trim().min(1).max(64).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

/** Body for creating a reference range. */
export const createReferenceRangeSchema = z
  .object({
    biomarkerCode: z.string().trim().min(1).max(64),
    biomarkerName: z.string().trim().min(1).max(160),
    biomarkerNameTr: z.string().trim().min(1).max(160).optional(),
    unit: z.string().trim().min(1).max(32),
    minValue: z.number().finite().nullable().optional(),
    maxValue: z.number().finite().nullable().optional(),
    optimalMin: z.number().finite().nullable().optional(),
    optimalMax: z.number().finite().nullable().optional(),
    gender: referenceRangeGenderEnum.default("ALL"),
    ageMin: z.number().int().nonnegative().nullable().optional(),
    ageMax: z.number().int().nonnegative().nullable().optional(),
    country: z
      .string()
      .trim()
      .length(2, "country must be an ISO 3166-1 alpha-2 code")
      .toUpperCase()
      .nullable()
      .optional(),
    laboratoryId: z.string().trim().min(1).max(64).nullable().optional(),
    isActive: z.boolean().default(true),
    source: z.string().trim().min(1).max(64).default("STANDARD"),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    (data) => data.minValue == null || data.maxValue == null || data.minValue <= data.maxValue,
    { message: "minValue must be less than or equal to maxValue", path: ["minValue"] },
  );

/** Body for updating a reference range (all fields optional). */
export const updateReferenceRangeSchema = z
  .object({
    biomarkerCode: z.string().trim().min(1).max(64).optional(),
    biomarkerName: z.string().trim().min(1).max(160).optional(),
    biomarkerNameTr: z.string().trim().min(1).max(160).nullable().optional(),
    unit: z.string().trim().min(1).max(32).optional(),
    minValue: z.number().finite().nullable().optional(),
    maxValue: z.number().finite().nullable().optional(),
    optimalMin: z.number().finite().nullable().optional(),
    optimalMax: z.number().finite().nullable().optional(),
    gender: referenceRangeGenderEnum.optional(),
    ageMin: z.number().int().nonnegative().nullable().optional(),
    ageMax: z.number().int().nonnegative().nullable().optional(),
    country: z.string().trim().length(2).toUpperCase().nullable().optional(),
    laboratoryId: z.string().trim().min(1).max(64).nullable().optional(),
    isActive: z.boolean().optional(),
    source: z.string().trim().min(1).max(64).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type RangeIdParam = z.infer<typeof rangeIdParamSchema>;
export type ListRangesQuery = z.infer<typeof listRangesQuerySchema>;
export type CreateReferenceRangeInput = z.infer<typeof createReferenceRangeSchema>;
export type UpdateReferenceRangeInput = z.infer<typeof updateReferenceRangeSchema>;
