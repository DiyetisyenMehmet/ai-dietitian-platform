import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { FOOD_SCAN_SYSTEM_PROMPT } from "./constants";
import type { FoodScanItem, FoodScanNutritionTotals, FoodScanResult } from "./types";

const MAX_TOKENS = 900;
const MAX_ATTEMPTS = 2;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = { role: "system" | "user"; content: string | ContentPart[] };

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: "abacus-routellm" | "openai-compatible";
}

function normalizedAbacusModel(model: string): string {
  return model.trim().toUpperCase() === "OPENAI_GPT4O" ? "route-llm" : model.trim();
}

function resolveProvider(): ProviderConfig {
  const useAbacus =
    env.AI_PROVIDER === "abacus" ||
    (env.AI_PROVIDER !== "openai" && Boolean(env.ABACUS_API_KEY) && !env.AI_API_KEY);

  if (useAbacus) {
    if (!env.ABACUS_API_KEY) {
      throw new ApiError(503, "Besin görsel analizi için AI sağlayıcısı yapılandırılmamış.", {
        code: "AI_NOT_CONFIGURED",
      });
    }
    return {
      apiKey: env.ABACUS_API_KEY,
      baseUrl: env.ABACUS_API_BASE_URL,
      model: normalizedAbacusModel(env.ABACUS_MODEL),
      provider: "abacus-routellm",
    };
  }

  if (!env.AI_API_KEY) {
    throw new ApiError(503, "Besin görsel analizi için AI sağlayıcısı yapılandırılmamış.", {
      code: "AI_NOT_CONFIGURED",
    });
  }

  return {
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

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeItem(value: unknown): FoodScanItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const name = String(item.name ?? "").trim();
  if (!name) return null;
  return {
    name: name.slice(0, 120),
    estimatedPortion: String(item.estimatedPortion ?? "Yaklaşık porsiyon").trim().slice(0, 120),
    calories: finiteOrNull(item.calories),
    proteinG: finiteOrNull(item.proteinG),
    carbsG: finiteOrNull(item.carbsG),
    fatG: finiteOrNull(item.fatG),
  };
}

function normalizeTotals(value: unknown): FoodScanNutritionTotals | null {
  if (!value || typeof value !== "object") return null;
  const totals = value as Record<string, unknown>;
  return {
    calories: finiteOrNull(totals.calories),
    proteinG: finiteOrNull(totals.proteinG),
    carbsG: finiteOrNull(totals.carbsG),
    fatG: finiteOrNull(totals.fatG),
  };
}

function normalizeResult(raw: string): FoodScanResult {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new ApiError(502, "Besin analiz servisi geçersiz yanıt verdi.", {
      code: "FOOD_SCAN_PROVIDER_MALFORMED",
      isOperational: false,
    });
  }

  const value = parsed as Record<string, unknown>;
  const confidence = Math.max(0, Math.min(100, Number(value.confidence) || 0));
  const isFood = value.isFood === true;
  const items =
    isFood && Array.isArray(value.items)
      ? value.items.map(normalizeItem).filter((item): item is FoodScanItem => item !== null).slice(0, 12)
      : [];

  return {
    isFood,
    confidence,
    reason: String(value.reason ?? "").trim().slice(0, 500),
    items,
    totals: isFood ? normalizeTotals(value.totals) : null,
    disclaimer:
      String(value.disclaimer ?? "").trim() ||
      "Görselden yapılan besin ve porsiyon tahminleri yaklaşık değerlerdir.",
  };
}

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function requestVision(buffer: Buffer, mimeType: string): Promise<string> {
  const provider = resolveProvider();
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const messages: ChatMessage[] = [
    { role: "system", content: FOOD_SCAN_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Önce görselde gerçekten yenilebilir bir besin, yemek veya içecek bulunup bulunmadığını doğrula. " +
            "Besin değilse kesinlikle isFood=false döndür. Besinse yalnızca görselden makul biçimde çıkarılabilen besinleri, yaklaşık porsiyonları ve yaklaşık makroları JSON olarak döndür.",
        },
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

/** Uses the configured provider while keeping the food-scan service vendor-neutral. */
export async function analyzeFoodImageWithProvider(
  buffer: Buffer,
  mimeType: string,
): Promise<FoodScanResult> {
  return normalizeResult(await requestVision(buffer, mimeType));
}
