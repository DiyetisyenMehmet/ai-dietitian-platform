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

interface VertexGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface VertexPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

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
    const host = this.vertex.location === "global" ? "aiplatform.googleapis.com" : `${this.vertex.location}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;

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
            maxOutputTokens: maxTokensOverride ?? this.vertex.maxTokens,
            temperature: this.vertex.temperature,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      logger.error({ err: error, model: this.vertex.model }, "Vertex AI request failed");
      throw new ApiError(502, "Vertex AI could not be reached.", {
        code: "AI_PROVIDER_UNREACHABLE",
        isOperational: false,
      });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.error(
        { status: response.status, detail, model: this.vertex.model },
        "Vertex AI returned an error",
      );
      throw new ApiError(502, "Vertex AI returned an error.", {
        code: "AI_PROVIDER_ERROR",
        isOperational: false,
      });
    }

    const body = (await response.json()) as VertexGenerateContentResponse;
    const content = body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!content) {
      throw new ApiError(502, "Vertex AI returned an empty response.", {
        code: "AI_PROVIDER_EMPTY",
        isOperational: false,
      });
    }
    return content;
  }
}
