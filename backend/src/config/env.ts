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

  // Stricter limiter for auth endpoints (login/register/refresh) to blunt
  // credential-stuffing and brute-force attempts (Gap: I-13 / A2).
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid connection string" }),

  // --- Authentication (Sprint 8) ---
  // Secrets MUST be provided in every environment; a minimum length is enforced
  // so a weak/placeholder secret cannot silently ship. Access and refresh use
  // separate secrets so leaking one does not compromise the other.
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  // Human-friendly TTLs (e.g. "15m", "7d") consumed by jsonwebtoken.
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  // Refresh-token lifetime in days — used to compute the DB `expiresAt`; keep
  // in sync with JWT_REFRESH_TTL.
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  JWT_ISSUER: z.string().default("diewish"),
  // bcrypt cost factor. 12 is a sane production default; higher = slower.
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
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
