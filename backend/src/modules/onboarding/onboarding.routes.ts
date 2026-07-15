import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { onboardingController } from "./onboarding.controller";
import { onboardingSchema } from "./onboarding.schemas";

/**
 * Onboarding router. Both endpoints require a valid access token; the profile
 * write also passes through `validate` against the mandatory-onboarding schema.
 */
export const onboardingRouter = Router();

/**
 * @openapi
 * /api/onboarding:
 *   get:
 *     tags: [Onboarding]
 *     summary: Get the current user's onboarding profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: The profile, or null when onboarding is pending. }
 *       401: { description: Missing or invalid access token. }
 */
onboardingRouter.get("/", authenticate, onboardingController.getProfile);

/**
 * @openapi
 * /api/onboarding:
 *   post:
 *     tags: [Onboarding]
 *     summary: Submit the mandatory onboarding profile and unlock the app
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               [fullName, dateOfBirth, gender, heightCm, currentWeightKg,
 *                targetWeightKg, activityLevel, dietaryPreference, dailyWaterGoalMl]
 *             properties:
 *               fullName: { type: string, example: "Ada Lovelace" }
 *               dateOfBirth: { type: string, format: date, example: "1990-05-20" }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY] }
 *               heightCm: { type: number, example: 172 }
 *               currentWeightKg: { type: number, example: 68 }
 *               targetWeightKg: { type: number, example: 62 }
 *               activityLevel:
 *                 { type: string, enum: [SEDENTARY, LIGHT, MODERATE, ACTIVE, VERY_ACTIVE] }
 *               healthConditions: { type: array, items: { type: string } }
 *               allergies: { type: array, items: { type: string } }
 *               dietaryPreference:
 *                 { type: string,
 *                   enum: [OMNIVORE, VEGETARIAN, VEGAN, PESCATARIAN, KETO, PALEO,
 *                          MEDITERRANEAN, GLUTEN_FREE, OTHER] }
 *               dailyWaterGoalMl: { type: integer, example: 2500 }
 *     responses:
 *       200: { description: Onboarding completed; app unlocked. }
 *       401: { description: Missing or invalid access token. }
 *       422: { description: Validation failed. }
 */
onboardingRouter.post("/", authenticate, validate({ body: onboardingSchema }), onboardingController.complete);
