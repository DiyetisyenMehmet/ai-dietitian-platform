import swaggerJSDoc from "swagger-jsdoc";

import { env } from "../config/env";

/**
 * OpenAPI (Swagger) specification. Route-level documentation is authored with
 * JSDoc `@openapi` annotations and collected via `apis` globbing, so the spec
 * stays close to the code it documents.
 */
const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Diewish API",
      version: "0.2.0",
      description:
        "Backend API for Diewish — a personal health & nutrition platform. " +
        "Includes the foundation baseline plus the authentication module; " +
        "additional domain endpoints are added in later sprints.",
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: "Local development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object" },
            meta: { type: "object" },
          },
          required: ["success", "data"],
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "NOT_FOUND" },
                message: { type: "string", example: "Resource not found" },
                details: {},
              },
              required: ["code", "message"],
            },
          },
          required: ["success", "error"],
        },
      },
    },
    tags: [
      { name: "Health", description: "Service health and readiness checks" },
      { name: "Auth", description: "Authentication, registration and session management" },
    ],
  },
  // Glob patterns support both TS (dev via tsx) and compiled JS (prod), and
  // cover both top-level routes and per-module routers under `modules/`.
  apis: [
    "./src/routes/*.ts",
    "./src/modules/**/*.routes.ts",
    "./dist/routes/*.js",
    "./dist/modules/**/*.routes.js",
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
