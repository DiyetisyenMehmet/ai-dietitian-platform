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
      title: "AI Dietitian Platform API",
      version: "0.1.0",
      description:
        "Backend API for the AI Dietitian Platform. This is the foundation baseline; " +
        "domain endpoints are added in later sprints.",
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: "Local development server",
      },
    ],
    components: {
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
    tags: [{ name: "Health", description: "Service health and readiness checks" }],
  },
  // Glob patterns support both TS (dev via tsx) and compiled JS (prod).
  apis: ["./src/routes/*.ts", "./dist/routes/*.js"],
};

export const swaggerSpec = swaggerJSDoc(options);
