import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import { ApiError } from "../../../utils/api-error";
import {
  OpenAICompatibleAdapter,
  type ChatMessage,
  type OpenAICompatibleConfig,
} from "./openai-compatible.adapter";
import type { AIAdapterInfo } from "./ai-adapter.interface";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

const MAX_ATTEMPTS = 2;

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Abacus RouteLLM transport using the official OpenAI-compatible API.
 *
 * All blood-test, nutrition-plan and dietitian-chat parsing/safety logic is
 * inherited from OpenAICompatibleAdapter; this class only hardens transport
 * with a strict timeout and one retry for transient 429/5xx failures.
 */
export class RouteLLMAdapter extends OpenAICompatibleAdapter {
  private readonly routeConfig: OpenAICompatibleConfig;

  constructor(config: OpenAICompatibleConfig) {
    super(config);
    this.routeConfig = config;
    Object.assign(this, {
      info: { provider: "abacus-routellm", model: config.model } satisfies AIAdapterInfo,
    });
  }

  protected override async chat(
    messages: ChatMessage[],
    maxTokensOverride?: number,
  ): Promise<string> {
    const url = `${this.routeConfig.baseUrl.replace(/\/+$/, "")}/chat/completions`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.routeConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: this.routeConfig.model,
            messages,
            max_tokens: maxTokensOverride ?? this.routeConfig.maxTokens,
            temperature: this.routeConfig.temperature,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (attempt < MAX_ATTEMPTS) continue;
        logger.error({ err: error }, "RouteLLM request failed");
        throw new ApiError(502, "The AI provider could not be reached.", {
          code: "AI_PROVIDER_UNREACHABLE",
          isOperational: false,
        });
      }

      if (!response.ok) {
        if (isRetryable(response.status) && attempt < MAX_ATTEMPTS) continue;

        logger.error({ status: response.status }, "RouteLLM returned an error");
        if (response.status === 401 || response.status === 403) {
          throw new ApiError(503, "The AI provider credentials are not accepted.", {
            code: "AI_PROVIDER_AUTH_FAILED",
            isOperational: false,
          });
        }
        throw new ApiError(502, "The AI provider returned an error.", {
          code: "AI_PROVIDER_ERROR",
          isOperational: false,
        });
      }

      const body = (await response.json()) as ChatCompletionResponse;
      const content = body.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new ApiError(502, "The AI provider returned an empty response.", {
          code: "AI_PROVIDER_EMPTY",
          isOperational: false,
        });
      }
      return content;
    }

    throw new ApiError(502, "The AI provider could not be reached.", {
      code: "AI_PROVIDER_UNREACHABLE",
      isOperational: false,
    });
  }
}
