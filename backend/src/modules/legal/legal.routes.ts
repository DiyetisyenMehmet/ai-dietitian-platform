import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { legalController } from "./legal.controller";
import {
  consentActionSchema,
  documentTypeParamSchema,
} from "./dto/legal.schemas";

/**
 * Legal & consent router (mounted at /api/legal).
 *
 * Document reads are public: the client must be able to render the privacy
 * policy, terms, medical disclaimer and KVKK consent text during signup, before
 * an access token exists. Consent state and grant/withdraw actions are scoped
 * to the authenticated user.
 *
 * Concrete paths (`/documents`, `/consents`) are declared before the
 * parameterized `/documents/:type` route so they are never shadowed.
 */
export const legalRouter = Router();

/**
 * @openapi
 * /api/legal/documents:
 *   get:
 *     tags: [Legal]
 *     summary: List all legal documents (metadata only)
 *     responses:
 *       200: { description: The available legal documents. }
 */
legalRouter.get("/documents", legalController.listDocuments);

/**
 * @openapi
 * /api/legal/consents:
 *   get:
 *     tags: [Legal]
 *     summary: Get the authenticated user's consent status
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Consent status across all documents. }
 *       401: { description: Missing or invalid access token. }
 */
legalRouter.get("/consents", authenticate, legalController.getConsents);

/**
 * @openapi
 * /api/legal/consents:
 *   post:
 *     tags: [Legal]
 *     summary: Grant consent for a legal document
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [PRIVACY_POLICY, TERMS_OF_SERVICE, MEDICAL_DISCLAIMER, KVKK_EXPLICIT_CONSENT]
 *     responses:
 *       200: { description: The recorded consent. }
 *       401: { description: Missing or invalid access token. }
 */
legalRouter.post(
  "/consents",
  authenticate,
  validate({ body: consentActionSchema }),
  legalController.grantConsent,
);

/**
 * @openapi
 * /api/legal/consents/withdraw:
 *   post:
 *     tags: [Legal]
 *     summary: Withdraw consent for a legal document
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [PRIVACY_POLICY, TERMS_OF_SERVICE, MEDICAL_DISCLAIMER, KVKK_EXPLICIT_CONSENT]
 *     responses:
 *       200: { description: The recorded withdrawal. }
 *       401: { description: Missing or invalid access token. }
 */
legalRouter.post(
  "/consents/withdraw",
  authenticate,
  validate({ body: consentActionSchema }),
  legalController.withdrawConsent,
);

/**
 * @openapi
 * /api/legal/documents/{type}:
 *   get:
 *     tags: [Legal]
 *     summary: Get a single legal document (with body)
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PRIVACY_POLICY, TERMS_OF_SERVICE, MEDICAL_DISCLAIMER, KVKK_EXPLICIT_CONSENT]
 *     responses:
 *       200: { description: The requested document. }
 *       404: { description: Unknown document type. }
 */
legalRouter.get(
  "/documents/:type",
  validate({ params: documentTypeParamSchema }),
  legalController.getDocument,
);
