import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Load variables from .env into process.env as early as possible.
loadDotenv();

/**
 * Environment schema. Validation happens once at startup so the process fails
 * fast (with a readable message) when configuration is missing or malformed,
 * rather than failing later at an arbitrary point in a request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  API_PREFIX: z.string().startsWith("/").default("/api"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid connection string" }),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    // Use console here directly: the logger itself depends on validated env.
    console.error(`\u274c Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  return parsed.data;
}

/** Validated, strongly-typed environment configuration. */
export const env: Env = loadEnv();

/** Convenience flags derived from NODE_ENV. */
export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

/**
 * CORS origins parsed into an array (supports a comma-separated list so multiple
 * frontends/environments can be allowed).
 */
export const corsOrigins: string[] = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
