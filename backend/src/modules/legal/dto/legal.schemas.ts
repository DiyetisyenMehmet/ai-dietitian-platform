import { z } from "zod";

/**
 * The legal document types clients may reference. Kept in sync with the Prisma
 * `LegalDocumentType` enum; declared explicitly so validation errors are clear.
 */
export const legalDocumentTypeSchema = z.enum([
  "PRIVACY_POLICY",
  "TERMS_OF_SERVICE",
  "MEDICAL_DISCLAIMER",
  "KVKK_EXPLICIT_CONSENT",
]);

/** Path param for fetching a single document by type. */
export const documentTypeParamSchema = z.object({
  type: legalDocumentTypeSchema,
});

/** Body for granting or withdrawing consent. */
export const consentActionSchema = z.object({
  type: legalDocumentTypeSchema,
});

export type DocumentTypeParam = z.infer<typeof documentTypeParamSchema>;
export type ConsentActionInput = z.infer<typeof consentActionSchema>;
