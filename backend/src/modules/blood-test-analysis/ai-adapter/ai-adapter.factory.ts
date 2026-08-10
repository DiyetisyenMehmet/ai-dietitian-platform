import { env } from "../../../config/env";
import { ApiError } from "../../../utils/api-error";
import { AbacusAIAdapter } from "./abacus-ai.adapter";
import { OpenAICompatibleAdapter } from "./openai-compatible.adapter";
import type { IAIAdapter } from "./ai-adapter.interface";

/**
 * Factory for the active {@link IAIAdapter}.
 *
 * The adapter is resolved from environment configuration so the AI provider can
 * be swapped without any code change:
 *  - `AI_PROVIDER=abacus` (or an `ABACUS_API_KEY` with no external `AI_API_KEY`)
 *    selects the Abacus.AI cluster-proxy adapter (the platform default).
 *  - `AI_PROVIDER=openai` (or an `AI_API_KEY`) selects the OpenAI-compatible
 *    adapter.
 * The instance is memoized for the process lifetime.
 */
let cached: IAIAdapter | undefined;

/**
 * Returns the configured AI adapter, constructing it on first use.
 *
 * @throws {ApiError} 500 when no AI provider credentials are configured.
 */
export function getAIAdapter(): IAIAdapter {
  if (cached) return cached;

  // Explicit selector wins; otherwise infer from whichever credential is set,
  // preferring the Abacus cluster proxy (the platform's built-in provider).
  const useAbacus =
    env.AI_PROVIDER === "abacus" ||
    (env.AI_PROVIDER !== "openai" && Boolean(env.ABACUS_API_KEY) && !env.AI_API_KEY);

  if (useAbacus) {
    if (!env.ABACUS_API_KEY) {
      throw new ApiError(
        500,
        "The AI provider is not configured (ABACUS_API_KEY is missing).",
        { code: "AI_NOT_CONFIGURED", isOperational: false },
      );
    }
    cached = new AbacusAIAdapter({
      apiKey: env.ABACUS_API_KEY,
      model: env.ABACUS_MODEL,
      maxTokens: env.AI_MAX_TOKENS,
      discoveryUrl: env.ABACUS_API_ENDPOINT_URL,
    });
    return cached;
  }

  if (!env.AI_API_KEY) {
    throw new ApiError(
      500,
      "The AI provider is not configured (set ABACUS_API_KEY or AI_API_KEY).",
      { code: "AI_NOT_CONFIGURED", isOperational: false },
    );
  }

  cached = new OpenAICompatibleAdapter({
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_API_BASE_URL,
    model: env.AI_MODEL,
    maxTokens: env.AI_MAX_TOKENS,
    temperature: env.AI_TEMPERATURE,
  });

  return cached;
}

/** Test/DI seam: overrides the cached adapter (used by unit tests). */
export function setAIAdapter(adapter: IAIAdapter): void {
  cached = adapter;
}
