import { env } from "../../../config/env";
import { ApiError } from "../../../utils/api-error";
import { OpenAICompatibleAdapter } from "./openai-compatible.adapter";
import type { IAIAdapter } from "./ai-adapter.interface";

/**
 * Factory for the active {@link IAIAdapter}.
 *
 * The adapter is resolved from environment configuration so the AI provider can
 * be swapped without any code change. Today only the OpenAI-compatible adapter
 * ships; additional providers can be registered here behind an env selector.
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

  if (!env.AI_API_KEY) {
    throw new ApiError(500, "The AI provider is not configured (AI_API_KEY is missing).", {
      code: "AI_NOT_CONFIGURED",
      isOperational: false,
    });
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
