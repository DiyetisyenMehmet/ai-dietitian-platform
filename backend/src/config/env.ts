import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  API_PREFIX: z.string().startsWith("/").default("/api"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid connection string" }),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  JWT_ISSUER: z.string().default("diewish"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  APP_WEB_URL: z.string().url().default("http://localhost:3000"),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  ACCOUNT_DELETION_GRACE_DAYS: z.coerce.number().int().nonnegative().default(30),

  STORAGE_PROVIDER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_ROOT: z.string().default("./storage/uploads"),
  BLOOD_TEST_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(15),

  AI_API_KEY: z.string().optional(),
  AI_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_MODEL: z.string().default("gpt-4o"),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(180_000).default(60_000),

  AI_PROVIDER: z.enum(["openai", "abacus"]).optional(),
  ABACUS_API_KEY: z.string().optional(),
  ABACUS_API_BASE_URL: z.string().url().default("https://routellm.abacus.ai/v1"),
  ABACUS_MODEL: z.string().default("route-llm"),
  ABACUS_API_ENDPOINT_URL: z
    .string()
    .url()
    .default("https://api.abacus.ai/api/v0/getApiEndpoint"),

  BLOOD_TEST_TEXT_MIN_CHARS: z.coerce.number().int().positive().default(100),
  BLOOD_TEST_VALIDATION_MIN_CONFIDENCE: z.coerce.number().int().min(0).max(100).default(95),
  BLOOD_TEST_VALIDATION_MIN_PARAMETERS: z.coerce.number().int().positive().default(3),

  PAYMENT_PROVIDER: z.enum(["iyzico"]).default("iyzico"),
  IYZICO_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  IYZICO_BASE_URL: z.string().url().default("https://sandbox-api.iyzipay.com"),
  IYZICO_API_KEY: z.string().optional(),
  IYZICO_SECRET_KEY: z.string().optional(),
  IYZICO_WEBHOOK_SECRET: z.string().optional(),
  IYZICO_CALLBACK_URL: z.string().url().default("http://localhost:3000/billing/callback"),
  BILLING_CURRENCY: z.string().length(3).default("TRY"),

  // Public legal identity. These are not secrets; production values must match
  // the merchant/contact details displayed on the Diewish website.
  LEGAL_CONTROLLER_NAME: z.string().default("Diewish"),
  LEGAL_CONTROLLER_ADDRESS: z.string().default(""),
  LEGAL_CONTROLLER_EMAIL: z.string().email().default("diewishdestek@hotmail.com"),
  LEGAL_CONTROLLER_KEP: z.string().default(""),
  LEGAL_CONTROLLER_PHONE: z.string().default(""),

  LEGAL_PRIVACY_POLICY_VERSION: z.string().default("2026-09-03"),
  LEGAL_TERMS_OF_SERVICE_VERSION: z.string().default("2026-09-03"),
  LEGAL_MEDICAL_DISCLAIMER_VERSION: z.string().default("2026-09-03"),
  LEGAL_KVKK_CONSENT_VERSION: z.string().default("2026-09-03"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    console.error(`❌ Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

export const corsOrigins: string[] = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
