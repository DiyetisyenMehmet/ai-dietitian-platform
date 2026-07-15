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

  // --- Account lifecycle (Sprint 10) ---
  // Public base URL of the web frontend, used to build the links embedded in
  // verification / password-reset emails.
  APP_WEB_URL: z.string().url().default("http://localhost:3000"),
  // Single-use token lifetimes. Verification links are long-lived; reset links
  // are deliberately short so a leaked link expires quickly.
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  // Grace period between an account-deletion request and eligibility for
  // permanent deletion, during which the request can be canceled.
  ACCOUNT_DELETION_GRACE_DAYS: z.coerce.number().int().nonnegative().default(30),

  // --- File storage / blood-test uploads (Sprint 11) ---
  // Storage backend selector. Only "local" ships now; the abstraction lets a
  // cloud provider (e.g. "s3") be added without touching callers.
  STORAGE_PROVIDER: z.enum(["local"]).default("local"),
  // Root directory for the local disk storage backend. Kept outside the repo
  // by default; created on demand. Ignored by non-local providers.
  STORAGE_LOCAL_ROOT: z.string().default("./storage/uploads"),
  // Maximum accepted blood-test file size, in megabytes.
  BLOOD_TEST_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(15),

  // --- AI Blood Test Analysis Engine (Sprint 12) ---
  // Provider-agnostic, OpenAI-compatible chat/completions API. Any endpoint
  // that speaks the OpenAI schema works (OpenAI, Mistral, Together, Groq, …).
  // The key is optional at startup so the rest of the app boots without it;
  // the analysis engine surfaces a clear error only when it is actually used.
  AI_API_KEY: z.string().optional(),
  AI_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_MODEL: z.string().default("gpt-4o"),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  // Minimum meaningful character count required from text extraction before
  // OCR fallback is triggered by the hybrid extraction pipeline.
  BLOOD_TEST_TEXT_MIN_CHARS: z.coerce.number().int().positive().default(100),

  // --- Payments / iyzico (Sprint 15, D2) ---
  // Payment provider selector. Only "iyzico" ships now; the modular payment
  // layer lets an additional provider be added later without touching callers.
  PAYMENT_PROVIDER: z.enum(["iyzico"]).default("iyzico"),
  // iyzico environment. "sandbox" targets the sandbox base URL by default so a
  // misconfigured deployment cannot accidentally charge real cards.
  IYZICO_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  // iyzico REST base URL. Defaults to the sandbox endpoint; set the production
  // URL (https://api.iyzipay.com) only alongside IYZICO_ENV=production.
  IYZICO_BASE_URL: z.string().url().default("https://sandbox-api.iyzipay.com"),
  // API credentials. Optional at startup so the app boots without them; the
  // payment service surfaces a clear error only when a payment is attempted.
  IYZICO_API_KEY: z.string().optional(),
  IYZICO_SECRET_KEY: z.string().optional(),
  // Secret used to verify inbound webhook signatures. Falls back to the API
  // secret when unset (iyzico signs notifications with the account secret).
  IYZICO_WEBHOOK_SECRET: z.string().optional(),
  // Public callback URL iyzico redirects to after a hosted-checkout payment.
  IYZICO_CALLBACK_URL: z.string().url().default("http://localhost:3000/billing/callback"),
  // Billing currency (ISO 4217). TRY for the Turkish market.
  BILLING_CURRENCY: z.string().length(3).default("TRY"),

  // --- Legal / consent (Sprint 15, B1–B4) ---
  // Current published version of each legal document. Bumping a version marks
  // existing user consents stale and forces re-consent on the next gated action.
  LEGAL_PRIVACY_POLICY_VERSION: z.string().default("2026-07-01"),
  LEGAL_TERMS_OF_SERVICE_VERSION: z.string().default("2026-07-01"),
  LEGAL_MEDICAL_DISCLAIMER_VERSION: z.string().default("2026-07-01"),
  LEGAL_KVKK_CONSENT_VERSION: z.string().default("2026-07-01"),
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
