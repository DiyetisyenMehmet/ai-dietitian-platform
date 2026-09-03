import { env } from "../../../config/env";
import { ApiError } from "../../../utils/api-error";
import { OpenAICompatibleAdapter } from "./openai-compatible.adapter";
import { RouteLLMAdapter } from "./route-llm.adapter";
import type { IAIAdapter } from "./ai-adapter.interface";

/**
 * Factory for the active provider-agnostic AI adapter.
 *
 * Abacus RouteLLM uses the official OpenAI-compatible endpoint, with a hardened
 * timeout/retry transport. Other OpenAI-compatible providers keep the generic
 * adapter. Callers remain completely vendor-agnostic.
 */
let cached: IAIAdapter | undefined;

function normalizedAbacusModel(model: string): string {
  return model.trim().toUpperCase() === "OPENAI_GPT4O" ? "route-llm" : model.trim();
}

export function getAIAdapter(): IAIAdapter {
  if (cached) return cached;

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

    cached = new RouteLLMAdapter({
      apiKey: env.ABACUS_API_KEY,
      baseUrl: env.ABACUS_API_BASE_URL,
      model: normalizedAbacusModel(env.ABACUS_MODEL),
      maxTokens: env.AI_MAX_TOKENS,
      temperature: env.AI_TEMPERATURE,
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
