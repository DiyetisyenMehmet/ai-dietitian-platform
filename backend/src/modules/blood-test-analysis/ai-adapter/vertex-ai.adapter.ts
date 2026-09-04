import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import { ApiError } from "../../../utils/api-error";
import {
  OpenAICompatibleAdapter,
  type ChatContentPart,
  type ChatMessage,
  type OpenAICompatibleConfig,
} from "./openai-compatible.adapter";
import type { AIAdapterInfo } from "./ai-adapter.interface";

export interface VertexAIConfig {
  project: string;
  location: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

interface MetadataTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface VertexUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

interface VertexGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: VertexUsageMetadata;
  promptFeedback?: {
    blockReason?: string;
  };
}

interface VertexPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

const CHAT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
  },
  required: ["reply"],
} as const;

const TRANSIENT_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const BLOCKED_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "MODEL_ARMOR",
]);
const PROVIDER_REQUEST_ATTEMPTS = 2;
const CHAT_MIN_OUTPUT_TOKENS = 2048;
const CHAT_RETRY_MAX_OUTPUT_TOKENS = 4096;

/**
 * Vertex AI implementation of Diewish's existing provider-agnostic adapter.
 *
 * It deliberately reuses the mature validation/parsing/safety behavior in the
 * OpenAI-compatible adapter and replaces only the provider transport. In Cloud
 * Run, credentials come from the attached service identity through the Google
 * metadata server; no API key or service-account private key is required.
 */
export class VertexAIAdapter extends OpenAICompatibleAdapter {
  public override readonly info: AIAdapterInfo;
  private readonly vertex: VertexAIConfig;
  private accessToken?: { value: string; expiresAt: number };

  constructor(config: VertexAIConfig) {
    const compatibilityConfig: OpenAICompatibleConfig = {
      apiKey: "vertex-service-identity",
      baseUrl: "https://unused.invalid",
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    };
    super(compatibilityConfig);
    this.vertex = config;
    this.info = { provider: "vertex-ai", model: config.model };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.value;
    }

    let response: Response;
    try {
      response = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        {
          headers: { "Metadata-Flavor": "Google" },
          signal: AbortSignal.timeout(5_000),
        },
      );
    } catch (error) {
      logger.error({ err: error }, "Vertex AI service-identity token request failed");
      throw new ApiError(503, "Vertex AI credentials are unavailable.", {
        code: "VERTEX_CREDENTIALS_UNAVAILABLE",
        isOperational: false,
      });
    }

    if (!response.ok) {
      logger.error({ status: response.status }, "Vertex AI service-identity token request failed");
      throw new ApiError(503, "Vertex AI credentials are unavailable.", {
        code: "VERTEX_CREDENTIALS_UNAVAILABLE",
        isOperational: false,
      });
    }

    const body = (await response.json()) as MetadataTokenResponse;
    if (!body.access_token) {
      throw new ApiError(503, "Vertex AI credentials are unavailable.", {
        code: "VERTEX_CREDENTIALS_UNAVAILABLE",
        isOperational: false,
      });
    }

    this.accessToken = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(60, body.expires_in ?? 300) * 1000,
    };
    return body.access_token;
  }

  private convertPart(part: ChatContentPart): VertexPart {
    if (part.type === "text") return { text: part.text };

    const match = /^data:([^;]+);base64,(.+)$/s.exec(part.image_url.url);
    if (!match) {
      throw new ApiError(500, "Vertex AI received an unsupported image payload.", {
        code: "VERTEX_IMAGE_PAYLOAD_INVALID",
        isOperational: false,
      });
    }
    return { inlineData: { mimeType: match[1], data: match[2] } };
  }

  private isGemini3Model(): boolean {
    return /^gemini-3(?:[.-]|$)/i.test(this.vertex.model);
  }

  private safeResponseMetadata(body: VertexGenerateContentResponse) {
    const candidate = body.candidates?.[0];
    return {
      finishReason: candidate?.finishReason ?? null,
      promptBlockReason: body.promptFeedback?.blockReason ?? null,
      promptTokenCount: body.usageMetadata?.promptTokenCount ?? null,
      candidatesTokenCount: body.usageMetadata?.candidatesTokenCount ?? null,
      thoughtsTokenCount: body.usageMetadata?.thoughtsTokenCount ?? null,
      totalTokenCount: body.usageMetadata?.totalTokenCount ?? null,
    };
  }

  private extractText(body: VertexGenerateContentResponse): string {
    return (
      body.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? ""
    );
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }

  private async generateContent(
    url: string,
    token: string,
    systemText: string,
    contents: Array<{ role: string; parts: VertexPart[] }>,
    maxOutputTokens: number,
    interactiveChat: boolean,
  ): Promise<VertexGenerateContentResponse> {
    const isGemini3 = this.isGemini3Model();

    for (let attempt = 1; attempt <= PROVIDER_REQUEST_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
            contents,
            generationConfig: {
              maxOutputTokens,
              responseMimeType: "application/json",
              ...(interactiveChat ? { responseSchema: CHAT_RESPONSE_SCHEMA } : {}),
              // Gemini 3.x manages sampling internally. LOW thinking keeps the
              // interactive coach responsive while retaining light reasoning.
              ...(isGemini3
                ? interactiveChat
                  ? { thinkingConfig: { thinkingLevel: "LOW" } }
                  : {}
                : { temperature: this.vertex.temperature }),
            },
          }),
          signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (attempt < PROVIDER_REQUEST_ATTEMPTS) {
          logger.warn(
            { attempt, model: this.vertex.model },
            "Vertex AI transport failed; retrying once",
          );
          await this.waitBeforeRetry(attempt);
          continue;
        }

        logger.error({ err: error, model: this.vertex.model }, "Vertex AI request failed");
        throw new ApiError(502, "Vertex AI could not be reached.", {
          code: "AI_PROVIDER_UNREACHABLE",
          isOperational: false,
        });
      }

      if (!response.ok) {
        if (TRANSIENT_HTTP_STATUSES.has(response.status) && attempt < PROVIDER_REQUEST_ATTEMPTS) {
          logger.warn(
            { status: response.status, attempt, model: this.vertex.model },
            "Vertex AI returned a transient error; retrying once",
          );
          await this.waitBeforeRetry(attempt);
          continue;
        }

        // Do not log the provider response body: it may contain request-derived
        // context. Status/model are sufficient for operational diagnosis.
        logger.error(
          { status: response.status, model: this.vertex.model },
          "Vertex AI returned an error",
        );
        throw new ApiError(502, "Vertex AI returned an error.", {
          code: "AI_PROVIDER_ERROR",
          isOperational: false,
        });
      }

      try {
        return (await response.json()) as VertexGenerateContentResponse;
      } catch (error) {
        if (attempt < PROVIDER_REQUEST_ATTEMPTS) {
          logger.warn(
            { attempt, model: this.vertex.model },
            "Vertex AI returned an invalid envelope; retrying once",
          );
          await this.waitBeforeRetry(attempt);
          continue;
        }

        logger.error(
          { err: error, model: this.vertex.model },
          "Vertex AI returned an invalid response envelope",
        );
        throw new ApiError(502, "Vertex AI returned an invalid response.", {
          code: "AI_PROVIDER_MALFORMED",
          isOperational: false,
        });
      }
    }

    throw new ApiError(502, "Vertex AI could not complete the request.", {
      code: "AI_PROVIDER_ERROR",
      isOperational: false,
    });
  }

  private blockedReply(): string {
    return JSON.stringify({
      reply:
        "Bu isteğe güvenli biçimde yanıt veremiyorum. Beslenme ve genel iyi oluş çerçevesinde farklı bir şekilde sorarsan yardımcı olabilirim.",
    });
  }

  protected override async chat(messages: ChatMessage[], maxTokensOverride?: number): Promise<string> {
    const systemText = messages
      .filter((message) => message.role === "system")
      .map((message) => (typeof message.content === "string" ? message.content : ""))
      .filter(Boolean)
      .join("\n\n");

    const contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts:
          typeof message.content === "string"
            ? [{ text: message.content }]
            : message.content.map((part) => this.convertPart(part)),
      }));

    const token = await this.getAccessToken();
    const location = encodeURIComponent(this.vertex.location);
    const project = encodeURIComponent(this.vertex.project);
    const model = encodeURIComponent(this.vertex.model);
    const host =
      this.vertex.location === "global"
        ? "aiplatform.googleapis.com"
        : `${this.vertex.location}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;

    const requestedMaxTokens = maxTokensOverride ?? this.vertex.maxTokens;
    // Today the only bounded override comes from the interactive dietitian chat
    // path. Gemini 3 thinking tokens share the output budget, so a 500-token
    // provider ceiling can exhaust itself before a complete JSON reply exists.
    // Keep the product-level concise/thorough prompt distinction, but give the
    // provider enough headroom to finish the structured response reliably.
    const interactiveChat = maxTokensOverride !== undefined;
    const providerMaxTokens = interactiveChat
      ? Math.max(requestedMaxTokens, CHAT_MIN_OUTPUT_TOKENS)
      : requestedMaxTokens;

    const first = await this.generateContent(
      url,
      token,
      systemText,
      contents,
      providerMaxTokens,
      interactiveChat,
    );
    const firstFinishReason = first.candidates?.[0]?.finishReason;
    const firstContent = this.extractText(first);

    if (firstFinishReason && BLOCKED_FINISH_REASONS.has(firstFinishReason)) {
      logger.warn(
        { model: this.vertex.model, ...this.safeResponseMetadata(first) },
        "Vertex AI blocked an interactive response",
      );
      return interactiveChat ? this.blockedReply() : firstContent;
    }

    if (firstFinishReason === "MAX_TOKENS") {
      const retryMaxTokens = interactiveChat
        ? CHAT_RETRY_MAX_OUTPUT_TOKENS
        : Math.min(Math.max(providerMaxTokens * 2, 1024), 4096);
      logger.warn(
        {
          model: this.vertex.model,
          maxOutputTokens: providerMaxTokens,
          retryMaxOutputTokens: retryMaxTokens,
          ...this.safeResponseMetadata(first),
        },
        "Vertex AI exhausted the output budget; retrying once",
      );

      const retry = await this.generateContent(
        url,
        token,
        systemText,
        contents,
        retryMaxTokens,
        interactiveChat,
      );
      const retryFinishReason = retry.candidates?.[0]?.finishReason;
      const retryContent = this.extractText(retry);

      if (retryFinishReason && BLOCKED_FINISH_REASONS.has(retryFinishReason)) {
        logger.warn(
          { model: this.vertex.model, ...this.safeResponseMetadata(retry) },
          "Vertex AI blocked an interactive response after retry",
        );
        return interactiveChat ? this.blockedReply() : retryContent;
      }

      if (retryContent && retryFinishReason !== "MAX_TOKENS") {
        return retryContent;
      }

      logger.error(
        { model: this.vertex.model, ...this.safeResponseMetadata(retry) },
        "Vertex AI retry did not produce a complete response",
      );
      throw new ApiError(502, "Vertex AI returned an incomplete response.", {
        code: "AI_PROVIDER_INCOMPLETE",
        isOperational: false,
      });
    }

    if (!firstContent) {
      logger.error(
        { model: this.vertex.model, ...this.safeResponseMetadata(first) },
        "Vertex AI returned no usable content",
      );
      throw new ApiError(502, "Vertex AI returned an empty response.", {
        code: "AI_PROVIDER_EMPTY",
        isOperational: false,
      });
    }

    return firstContent;
  }
}
