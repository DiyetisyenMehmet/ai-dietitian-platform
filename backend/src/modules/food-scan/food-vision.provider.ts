import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { FOOD_SCAN_SYSTEM_PROMPT } from "./constants";
import type { FoodVisionIngredientCandidate, FoodVisionResult } from "./types";

const MAX_TOKENS = 1_000;
const MAX_ATTEMPTS = 2;
const USER_PROMPT =
  "Görseli yalnız yemek/besin tanıma, porsiyon gramı ve muhtemel tarif bileşenleri açısından analiz et. " +
  "Kalori veya herhangi bir besin değeri üretme. Emin olmadığın malzemeleri optional=true ve düşük confidence ile belirt.";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = { role: "system" | "user"; content: string | ContentPart[] };

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

interface VertexGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

interface MetadataTokenResponse {
  access_token?: string;
  expires_in?: number;
}

export type FoodVisionProviderKind = "vertex" | "abacus" | "openai";

export interface FoodVisionProviderSettings {
  aiProvider?: "openai" | "abacus" | "vertex";
  aiApiKey?: string;
  abacusApiKey?: string;
}

interface OpenAIProviderConfig {
  kind: "abacus" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: "abacus-routellm" | "openai-compatible";
}

interface VertexProviderConfig {
  kind: "vertex";
  project: string;
  location: string;
  model: string;
  provider: "vertex-ai";
}

type ProviderConfig = OpenAIProviderConfig | VertexProviderConfig;

export const FOOD_VISION_VERTEX_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isFood: { type: "BOOLEAN" },
    confidence: { type: "NUMBER" },
    reason: { type: "STRING" },
    dishName: { type: "STRING", nullable: true },
    estimatedPortion: { type: "STRING", nullable: true },
    estimatedGrams: { type: "NUMBER", nullable: true },
    ingredients: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          estimatedGrams: { type: "NUMBER", nullable: true },
          confidence: { type: "NUMBER" },
          optional: { type: "BOOLEAN" },
        },
        required: ["name", "estimatedGrams", "confidence", "optional"],
      },
    },
    disclaimer: { type: "STRING" },
  },
  required: [
    "isFood",
    "confidence",
    "reason",
    "dishName",
    "estimatedPortion",
    "estimatedGrams",
    "ingredients",
    "disclaimer",
  ],
} as const;

export function resolveFoodVisionProviderKind(
  settings: FoodVisionProviderSettings,
): FoodVisionProviderKind {
  if (settings.aiProvider === "vertex") return "vertex";
  if (settings.aiProvider === "abacus") return "abacus";
  if (settings.aiProvider === "openai") return "openai";
  if (settings.abacusApiKey && !settings.aiApiKey) return "abacus";
  return "openai";
}

function normalizedAbacusModel(model: string): string {
  return model.trim().toUpperCase() === "OPENAI_GPT4O" ? "route-llm" : model.trim();
}

function notConfigured(): ApiError {
  return new ApiError(503, "Besin görsel analizi için AI sağlayıcısı yapılandırılmamış.", {
    code: "AI_NOT_CONFIGURED",
  });
}

function resolveProvider(): ProviderConfig {
  const kind = resolveFoodVisionProviderKind({
    aiProvider: env.AI_PROVIDER,
    aiApiKey: env.AI_API_KEY,
    abacusApiKey: env.ABACUS_API_KEY,
  });

  if (kind === "vertex") {
    if (!env.GOOGLE_CLOUD_PROJECT.trim()) throw notConfigured();
    return {
      kind,
      project: env.GOOGLE_CLOUD_PROJECT,
      location: env.VERTEX_AI_LOCATION,
      model: env.VERTEX_AI_MODEL,
      provider: "vertex-ai",
    };
  }

  if (kind === "abacus") {
    if (!env.ABACUS_API_KEY) throw notConfigured();
    return {
      kind,
      apiKey: env.ABACUS_API_KEY,
      baseUrl: env.ABACUS_API_BASE_URL,
      model: normalizedAbacusModel(env.ABACUS_MODEL),
      provider: "abacus-routellm",
    };
  }

  if (!env.AI_API_KEY) throw notConfigured();
  return {
    kind,
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_API_BASE_URL,
    model: env.AI_MODEL,
    provider: "openai-compatible",
  };
}

function dataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function parseJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    throw new ApiError(502, "Besin analiz servisi geçersiz yanıt verdi.", {
      code: "FOOD_SCAN_PROVIDER_MALFORMED",
      isOperational: false,
    });
  }
}

function finitePositiveOrNull(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 10) / 10 : null;
}

function confidence(value: unknown): number {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function normalizeIngredient(value: unknown): FoodVisionIngredientCandidate | null {
  if (!value || typeof value !== "object") return null;
  const ingredient = value as Record<string, unknown>;
  const name = String(ingredient.name ?? "").trim();
  if (!name) return null;
  return {
    name: name.slice(0, 120),
    estimatedGrams: finitePositiveOrNull(ingredient.estimatedGrams, 5_000),
    confidence: confidence(ingredient.confidence),
    optional: ingredient.optional === true,
  };
}

function normalizeResult(raw: string): FoodVisionResult {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new ApiError(502, "Besin analiz servisi geçersiz yanıt verdi.", {
      code: "FOOD_SCAN_PROVIDER_MALFORMED",
      isOperational: false,
    });
  }

  const value = parsed as Record<string, unknown>;
  const isFood = value.isFood === true;
  const ingredients =
    isFood && Array.isArray(value.ingredients)
      ? value.ingredients
          .map(normalizeIngredient)
          .filter((item): item is FoodVisionIngredientCandidate => item !== null)
          .slice(0, 16)
      : [];
  const dishName = isFood ? String(value.dishName ?? "").trim().slice(0, 120) || null : null;

  return {
    isFood,
    confidence: confidence(value.confidence),
    reason: String(value.reason ?? "").trim().slice(0, 500),
    dishName,
    estimatedPortion: isFood
      ? String(value.estimatedPortion ?? "").trim().slice(0, 120) || null
      : null,
    estimatedGrams: isFood ? finitePositiveOrNull(value.estimatedGrams, 5_000) : null,
    ingredients,
    disclaimer:
      String(value.disclaimer ?? "").trim() ||
      "Tarif ve porsiyon görüntüden tahmin edilir; besin değerleri güvenilir veri kaynaklarından hesaplanır.",
  };
}

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function requestOpenAICompatible(
  provider: OpenAIProviderConfig,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const messages: ChatMessage[] = [
    { role: "system", content: FOOD_SCAN_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: USER_PROMPT },
        { type: "image_url", image_url: { url: dataUrl(buffer, mimeType) } },
      ],
    },
  ];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          max_tokens: MAX_TOKENS,
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) continue;
      logger.warn({ err: error, provider: provider.provider }, "Food scan provider request failed");
      throw new ApiError(502, "Besin analiz servisine ulaşılamadı.", {
        code: "FOOD_SCAN_PROVIDER_UNREACHABLE",
      });
    }

    if (!response.ok) {
      if (retryableStatus(response.status) && attempt < MAX_ATTEMPTS) continue;
      logger.warn(
        { status: response.status, provider: provider.provider },
        "Food scan provider returned an error",
      );
      const statusCode = response.status === 401 || response.status === 403 ? 503 : 502;
      throw new ApiError(statusCode, "Besin analiz servisi şu anda kullanılamıyor.", {
        code:
          response.status === 401 || response.status === 403
            ? "AI_PROVIDER_AUTH_FAILED"
            : "FOOD_SCAN_PROVIDER_ERROR",
      });
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new ApiError(502, "Besin analiz servisinden boş yanıt geldi.", {
        code: "FOOD_SCAN_PROVIDER_EMPTY",
      });
    }
    return content;
  }

  throw new ApiError(502, "Besin analiz servisine ulaşılamadı.", {
    code: "FOOD_SCAN_PROVIDER_UNREACHABLE",
  });
}

let vertexAccessToken: { value: string; expiresAt: number } | null = null;

async function getVertexAccessToken(): Promise<string> {
  if (vertexAccessToken && vertexAccessToken.expiresAt > Date.now() + 60_000) {
    return vertexAccessToken.value;
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
    logger.warn({ err: error }, "Food scan Vertex service-identity token request failed");
    throw new ApiError(503, "Vertex AI credentials are unavailable.", {
      code: "VERTEX_CREDENTIALS_UNAVAILABLE",
      isOperational: false,
    });
  }

  if (!response.ok) {
    logger.warn({ status: response.status }, "Food scan Vertex service-identity token request failed");
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
  vertexAccessToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, body.expires_in ?? 300) * 1_000,
  };
  return vertexAccessToken.value;
}

function vertexUrl(provider: VertexProviderConfig): string {
  const host =
    provider.location === "global"
      ? "aiplatform.googleapis.com"
      : `${provider.location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(provider.project)}/locations/${encodeURIComponent(provider.location)}/publishers/google/models/${encodeURIComponent(provider.model)}:generateContent`;
}

function extractVertexText(body: VertexGenerateContentResponse): string {
  return (
    body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

async function requestVertex(
  provider: VertexProviderConfig,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const token = await getVertexAccessToken();
  const url = vertexUrl(provider);
  const isGemini3 = /^gemini-3(?:[.-]|$)/i.test(provider.model);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: FOOD_SCAN_SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: USER_PROMPT },
                { inlineData: { mimeType, data: buffer.toString("base64") } },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: MAX_TOKENS,
            responseMimeType: "application/json",
            responseSchema: FOOD_VISION_VERTEX_RESPONSE_SCHEMA,
            ...(isGemini3 ? { thinkingConfig: { thinkingLevel: "LOW" } } : { temperature: 0.1 }),
          },
        }),
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) continue;
      logger.warn({ err: error, provider: provider.provider }, "Food scan Vertex request failed");
      throw new ApiError(502, "Besin analiz servisine ulaşılamadı.", {
        code: "FOOD_SCAN_PROVIDER_UNREACHABLE",
      });
    }

    if (!response.ok) {
      if (retryableStatus(response.status) && attempt < MAX_ATTEMPTS) continue;
      logger.warn(
        { status: response.status, provider: provider.provider },
        "Food scan Vertex returned an error",
      );
      const authFailure = response.status === 401 || response.status === 403;
      throw new ApiError(authFailure ? 503 : 502, "Besin analiz servisi şu anda kullanılamıyor.", {
        code: authFailure ? "AI_PROVIDER_AUTH_FAILED" : "FOOD_SCAN_PROVIDER_ERROR",
      });
    }

    const body = (await response.json()) as VertexGenerateContentResponse;
    const content = extractVertexText(body);
    if (content) return content;
    if (body.promptFeedback?.blockReason) {
      throw new ApiError(502, "Besin analiz servisi görsel yanıtını güvenlik nedeniyle engelledi.", {
        code: "FOOD_SCAN_PROVIDER_BLOCKED",
      });
    }
    throw new ApiError(502, "Besin analiz servisinden boş yanıt geldi.", {
      code: "FOOD_SCAN_PROVIDER_EMPTY",
    });
  }

  throw new ApiError(502, "Besin analiz servisine ulaşılamadı.", {
    code: "FOOD_SCAN_PROVIDER_UNREACHABLE",
  });
}

async function requestVision(buffer: Buffer, mimeType: string): Promise<string> {
  const provider = resolveProvider();
  return provider.kind === "vertex"
    ? requestVertex(provider, buffer, mimeType)
    : requestOpenAICompatible(provider, buffer, mimeType);
}

/** Vision is vendor-neutral and returns no nutrition facts by design. */
export async function analyzeFoodImageWithProvider(
  buffer: Buffer,
  mimeType: string,
): Promise<FoodVisionResult> {
  return normalizeResult(await requestVision(buffer, mimeType));
}
