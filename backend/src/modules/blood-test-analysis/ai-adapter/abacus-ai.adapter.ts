import { ApiError } from "../../../utils/api-error";
import { logger } from "../../../lib/logger";
import type { AIAdapterInfo } from "./ai-adapter.interface";
import {
  OpenAICompatibleAdapter,
  type ChatMessage,
  type OpenAICompatibleConfig,
} from "./openai-compatible.adapter";

/** Configuration for the Abacus.AI cluster-proxy adapter. */
export interface AbacusAIConfig {
  /** Abacus.AI platform API key (APIKEY header). */
  apiKey: string;
  /** LLM name understood by the cluster proxy (e.g. "OPENAI_GPT4O"). */
  model: string;
  /** Maximum tokens per completion. */
  maxTokens: number;
  /**
   * Base URL for endpoint discovery. Defaults to the public Abacus.AI API.
   * The concrete cluster proxy endpoint is discovered from here at runtime.
   */
  discoveryUrl?: string;
}

/** Shape of the endpoint-discovery response we rely on. */
interface ApiEndpointResponse {
  success?: boolean;
  result?: { proxyEndpoint?: string };
}

/** Shape of the cluster-proxy `evaluatePrompt` response we rely on. */
interface EvaluatePromptResponse {
  success?: boolean;
  result?: { content?: string | null };
}

/**
 * An {@link IAIAdapter} backed by the Abacus.AI cluster-proxy LLM API.
 *
 * It reuses every parsing, normalization, and safety guard from
 * {@link OpenAICompatibleAdapter} and only swaps the transport: instead of an
 * OpenAI-style `/chat/completions` call it targets the cluster proxy's
 * `evaluatePrompt` endpoint (discovered dynamically and cached for the process
 * lifetime). This keeps the validation logic, thresholds, and error messages
 * identical to the OpenAI-compatible path.
 *
 * The proxy does not support OpenAI's `response_format: json_object`; the
 * inherited prompts already request JSON explicitly, and the inherited
 * `parseJson` helper tolerates any surrounding whitespace / fences.
 */
export class AbacusAIAdapter extends OpenAICompatibleAdapter {
  private readonly abacusApiKey: string;
  private readonly abacusModel: string;
  private readonly abacusMaxTokens: number;
  private readonly discoveryUrl: string;
  /** Cached cluster-proxy endpoint, resolved lazily on first use. */
  private proxyEndpoint?: string;
  /** In-flight discovery promise so concurrent calls share one lookup. */
  private discovery?: Promise<string>;

  constructor(config: AbacusAIConfig) {
    // The base class needs a well-formed OpenAI config shape; the transport is
    // fully overridden below, so baseUrl/temperature are never used to build a
    // request. They are set to valid, inert defaults to satisfy the base type.
    const baseConfig: OpenAICompatibleConfig = {
      apiKey: config.apiKey,
      baseUrl: "https://api.abacus.ai",
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: 0.2,
    };
    super(baseConfig);

    this.abacusApiKey = config.apiKey;
    this.abacusModel = config.model;
    this.abacusMaxTokens = config.maxTokens;
    this.discoveryUrl =
      config.discoveryUrl ?? "https://api.abacus.ai/api/v0/getApiEndpoint";

    // Override the reported provider/model. `info` is declared readonly on the
    // base class, so it is set via Object.assign (allowed at construction time).
    Object.assign(this, {
      info: { provider: "abacus-ai", model: config.model } satisfies AIAdapterInfo,
    });
  }

  /**
   * Resolves (and caches) the cluster-proxy endpoint from Abacus.AI's endpoint
   * discovery API. Concurrent callers share a single in-flight lookup.
   */
  private async resolveProxyEndpoint(): Promise<string> {
    if (this.proxyEndpoint) return this.proxyEndpoint;
    if (this.discovery) return this.discovery;

    this.discovery = (async () => {
      let response: Response;
      try {
        response = await fetch(this.discoveryUrl, {
          method: "GET",
          headers: { APIKEY: this.abacusApiKey },
        });
      } catch (error) {
        logger.error({ err: error }, "Abacus endpoint discovery request failed");
        throw new ApiError(502, "The AI provider could not be reached.", {
          code: "AI_PROVIDER_UNREACHABLE",
          isOperational: false,
        });
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        logger.error(
          { status: response.status, detail },
          "Abacus endpoint discovery returned an error",
        );
        throw new ApiError(502, "The AI provider returned an error.", {
          code: "AI_PROVIDER_ERROR",
          isOperational: false,
        });
      }

      const body = (await response.json()) as ApiEndpointResponse;
      const endpoint = body.result?.proxyEndpoint;
      if (!endpoint || typeof endpoint !== "string") {
        throw new ApiError(502, "The AI provider returned an empty response.", {
          code: "AI_PROVIDER_EMPTY",
          isOperational: false,
        });
      }

      this.proxyEndpoint = endpoint.replace(/\/+$/, "");
      return this.proxyEndpoint;
    })();

    try {
      return await this.discovery;
    } finally {
      // Clear the in-flight marker; `proxyEndpoint` stays cached on success.
      this.discovery = undefined;
    }
  }

  /**
   * Sends a chat request to the Abacus cluster proxy's `evaluatePrompt`
   * endpoint and returns the assistant content as a string.
   *
   * The OpenAI-style message list is adapted to the proxy shape: any leading
   * system message(s) become `systemMessage`, and the remaining user/assistant
   * turns are passed through unchanged (multimodal `content` parts included).
   *
   * @override — swaps transport while preserving the base return contract.
   */
  protected override async chat(
    messages: ChatMessage[],
    maxTokensOverride?: number,
  ): Promise<string> {
    const proxyEndpoint = await this.resolveProxyEndpoint();
    const url = `${proxyEndpoint}/api/evaluatePrompt`;

    // Separate system message(s) from the conversation turns. The proxy takes a
    // single `systemMessage` string; multiple system parts are concatenated.
    const systemMessage = messages
      .filter((m) => m.role === "system" && typeof m.content === "string")
      .map((m) => m.content as string)
      .join("\n\n");
    const conversation = messages.filter((m) => m.role !== "system");

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          APIKEY: this.abacusApiKey,
        },
        body: JSON.stringify({
          llmName: this.abacusModel,
          systemMessage,
          messages: conversation,
          maxTokens: maxTokensOverride ?? this.abacusMaxTokens,
        }),
      });
    } catch (error) {
      logger.error({ err: error }, "AI provider request failed");
      throw new ApiError(502, "The AI provider could not be reached.", {
        code: "AI_PROVIDER_UNREACHABLE",
        isOperational: false,
      });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.error({ status: response.status, detail }, "AI provider returned an error");
      throw new ApiError(502, "The AI provider returned an error.", {
        code: "AI_PROVIDER_ERROR",
        isOperational: false,
      });
    }

    const body = (await response.json()) as EvaluatePromptResponse;
    const content = body.result?.content;
    if (!content || typeof content !== "string") {
      throw new ApiError(502, "The AI provider returned an empty response.", {
        code: "AI_PROVIDER_EMPTY",
        isOperational: false,
      });
    }
    return content;
  }
}
