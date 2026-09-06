import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import { ApiError } from "../../../utils/api-error";
import { NUTRITION_PLAN_SYSTEM_PROMPT } from "../../nutrition-plan/constants";
import { ANALYSIS_SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT } from "../constants";
import { DOCUMENT_VALIDATION_SYSTEM_PROMPT } from "../validation/document-validation.constants";
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

type VertexResponseSchema = Readonly<Record<string, unknown>>;

const CHAT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
  },
  required: ["reply"],
} as const;

const DOCUMENT_VALIDATION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    classification: { type: "STRING", enum: ["VALID", "INVALID"] },
    confidence: { type: "NUMBER" },
    hospital: { type: "STRING", nullable: true },
    reportDate: { type: "STRING", nullable: true },
    patient: {
      type: "OBJECT",
      nullable: true,
      properties: {
        name: { type: "STRING", nullable: true },
        gender: { type: "STRING", nullable: true },
        birthDateOrAge: { type: "STRING", nullable: true },
      },
      required: ["name", "gender", "birthDateOrAge"],
    },
    barcode: { type: "STRING", nullable: true },
    hasLabTable: { type: "BOOLEAN" },
    parameterCount: { type: "INTEGER" },
    detectedParameters: { type: "ARRAY", items: { type: "STRING" } },
    reason: { type: "STRING" },
  },
  required: [
    "classification",
    "confidence",
    "hospital",
    "reportDate",
    "patient",
    "barcode",
    "hasLabTable",
    "parameterCount",
    "detectedParameters",
    "reason",
  ],
} as const;

const EXTRACTION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    values: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          rawValue: { type: "STRING" },
          unit: { type: "STRING" },
          referenceRange: { type: "STRING" },
        },
        required: ["name", "rawValue", "unit", "referenceRange"],
      },
    },
  },
  required: ["values"],
} as const;

const BLOOD_ANALYSIS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    explanations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          biomarkerCode: { type: "STRING" },
          biomarkerName: { type: "STRING" },
          status: {
            type: "STRING",
            enum: ["NORMAL", "LOW", "HIGH", "CRITICALLY_LOW", "CRITICALLY_HIGH", "UNKNOWN"],
          },
          explanation: { type: "STRING" },
        },
        required: ["biomarkerCode", "biomarkerName", "status", "explanation"],
      },
    },
    nutritionImplications: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          biomarkerCode: { type: "STRING" },
          biomarkerName: { type: "STRING" },
          implication: { type: "STRING" },
          possibleNutritionFactors: { type: "ARRAY", items: { type: "STRING" } },
          suggestedFoods: { type: "ARRAY", items: { type: "STRING" } },
          foodsToLimit: { type: "ARRAY", items: { type: "STRING" } },
          mealIdeas: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: [
          "biomarkerCode",
          "biomarkerName",
          "implication",
          "possibleNutritionFactors",
          "suggestedFoods",
          "foodsToLimit",
          "mealIdeas",
        ],
      },
    },
    overallRecommendations: { type: "ARRAY", items: { type: "STRING" } },
    summary: { type: "STRING" },
  },
  required: ["explanations", "nutritionImplications", "overallRecommendations", "summary"],
} as const;

const NUTRITION_PLAN_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    cycle: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          dayLabel: { type: "STRING" },
          meals: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                time: { type: "STRING" },
                foods: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      portion: { type: "STRING" },
                      calories: { type: "NUMBER" },
                    },
                    required: ["name", "portion", "calories"],
                  },
                },
                calories: { type: "NUMBER" },
                proteinGrams: { type: "NUMBER" },
                carbsGrams: { type: "NUMBER" },
                fatGrams: { type: "NUMBER" },
                explanation: { type: "STRING" },
              },
              required: [
                "name",
                "time",
                "foods",
                "calories",
                "proteinGrams",
                "carbsGrams",
                "fatGrams",
                "explanation",
              ],
            },
          },
          totalCalories: { type: "NUMBER" },
          totalProteinGrams: { type: "NUMBER" },
          totalCarbsGrams: { type: "NUMBER" },
          totalFatGrams: { type: "NUMBER" },
          notes: { type: "STRING", nullable: true },
        },
        required: [
          "dayLabel",
          "meals",
          "totalCalories",
          "totalProteinGrams",
          "totalCarbsGrams",
          "totalFatGrams",
        ],
      },
    },
    explanations: {
      type: "OBJECT",
      properties: {
        calories: { type: "STRING" },
        macros: { type: "STRING" },
        water: { type: "STRING" },
        mealTiming: { type: "STRING" },
        overall: { type: "STRING" },
      },
      required: ["calories", "macros", "water", "mealTiming", "overall"],
    },
    recommendations: { type: "ARRAY", items: { type: "STRING" } },
    summary: { type: "STRING" },
  },
  required: ["cycle", "explanations", "recommendations", "summary"],
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
const NUTRITION_PLAN_MIN_OUTPUT_TOKENS = 8192;
const STRUCTURED_RETRY_MAX_OUTPUT_TOKENS = 8192;

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

  private responseSchemaFor(messages: ChatMessage[]): VertexResponseSchema | undefined {
    for (const message of messages) {
      if (message.role !== "system" || typeof message.content !== "string") continue;
      if (message.content === DOCUMENT_VALIDATION_SYSTEM_PROMPT) {
        return DOCUMENT_VALIDATION_RESPONSE_SCHEMA;
      }
      if (message.content === EXTRACTION_SYSTEM_PROMPT) return EXTRACTION_RESPONSE_SCHEMA;
      if (message.content === ANALYSIS_SYSTEM_PROMPT) return BLOOD_ANALYSIS_RESPONSE_SCHEMA;
      if (message.content === NUTRITION_PLAN_SYSTEM_PROMPT) return NUTRITION_PLAN_RESPONSE_SCHEMA;
    }
    return undefined;
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
    responseSchema?: VertexResponseSchema,
  ): Promise<VertexGenerateContentResponse> {
    const isGemini3 = this.isGemini3Model();
    const effectiveResponseSchema = responseSchema ?? (interactiveChat ? CHAT_RESPONSE_SCHEMA : undefined);

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
              ...(effectiveResponseSchema ? { responseSchema: effectiveResponseSchema } : {}),
              // Gemini 3.x manages sampling internally. LOW thinking keeps
              // bounded structured responses reliable without removing the
              // deterministic medical safety/reference-range layer.
              ...(isGemini3
                ? interactiveChat || responseSchema
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

  private throwBlockedStructuredResponse(body: VertexGenerateContentResponse): never {
    logger.warn(
      { model: this.vertex.model, ...this.safeResponseMetadata(body) },
      "Vertex AI blocked a structured response",
    );
    throw new ApiError(502, "Vertex AI blocked the structured response.", {
      code: "AI_PROVIDER_BLOCKED",
      isOperational: false,
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

    const responseSchema = this.responseSchemaFor(messages);
    const requestedMaxTokens = maxTokensOverride ?? this.vertex.maxTokens;
    // Interactive chat stays bounded. Structured nutrition plans receive a
    // larger first-pass budget because one response contains a full weekly cycle.
    const interactiveChat = maxTokensOverride !== undefined && !responseSchema;
    const nutritionPlanRequest = responseSchema === NUTRITION_PLAN_RESPONSE_SCHEMA;
    const providerMaxTokens = nutritionPlanRequest
      ? Math.max(requestedMaxTokens, NUTRITION_PLAN_MIN_OUTPUT_TOKENS)
      : interactiveChat
        ? Math.max(requestedMaxTokens, CHAT_MIN_OUTPUT_TOKENS)
        : requestedMaxTokens;

    const first = await this.generateContent(
      url,
      token,
      systemText,
      contents,
      providerMaxTokens,
      interactiveChat,
      responseSchema,
    );
    const firstFinishReason = first.candidates?.[0]?.finishReason;
    const firstContent = this.extractText(first);

    if (firstFinishReason && BLOCKED_FINISH_REASONS.has(firstFinishReason)) {
      if (responseSchema) this.throwBlockedStructuredResponse(first);
      logger.warn(
        { model: this.vertex.model, ...this.safeResponseMetadata(first) },
        "Vertex AI blocked an interactive response",
      );
      return interactiveChat ? this.blockedReply() : firstContent;
    }

    if (firstFinishReason === "MAX_TOKENS") {
      const retryMaxTokens = interactiveChat
        ? CHAT_RETRY_MAX_OUTPUT_TOKENS
        : Math.min(
            Math.max(providerMaxTokens * 2, providerMaxTokens),
            STRUCTURED_RETRY_MAX_OUTPUT_TOKENS,
          );
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
        responseSchema,
      );
      const retryFinishReason = retry.candidates?.[0]?.finishReason;
      const retryContent = this.extractText(retry);

      if (retryFinishReason && BLOCKED_FINISH_REASONS.has(retryFinishReason)) {
        if (responseSchema) this.throwBlockedStructuredResponse(retry);
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
