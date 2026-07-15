import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { authRateLimiter } from "../../middleware/auth-rate-limit";
import { validate } from "../../middleware/validate";
import { authController } from "./auth.controller";
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from "./auth.schemas";

/**
 * Auth router. Unauthenticated, abuse-prone endpoints (register/login/refresh)
 * sit behind the stricter `authRateLimiter`; `/me` requires a valid access
 * token via `authenticate`.
 */
export const authRouter = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, example: "Str0ngPass" }
 *               fullName: { type: string, example: "Ada Lovelace" }
 *     responses:
 *       201: { description: Account created; returns user and token pair. }
 *       409: { description: Email already registered. }
 *       422: { description: Validation failed. }
 */
authRouter.post(
  "/register",
  authRateLimiter,
  validate({ body: registerSchema }),
  authController.register,
);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Authenticated; returns user and token pair. }
 *       401: { description: Invalid credentials. }
 *       403: { description: Account deactivated. }
 */
authRouter.post("/login", authRateLimiter, validate({ body: loginSchema }), authController.login);

/**
 * @openapi
 * /api/auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a refresh token for a new token pair (with rotation)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: New token pair issued. }
 *       401: { description: Invalid, expired, or reused refresh token. }
 */
authRouter.post(
  "/refresh-token",
  authRateLimiter,
  validate({ body: refreshSchema }),
  authController.refresh,
);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke a refresh token (logout)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Logged out (idempotent). }
 */
authRouter.post("/logout", validate({ body: logoutSchema }), authController.logout);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the currently authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: The authenticated user's public profile. }
 *       401: { description: Missing or invalid access token. }
 */
authRouter.get("/me", authenticate, authController.me);
