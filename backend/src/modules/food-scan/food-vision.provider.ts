import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { FOOD_SCAN_SYSTEM_PROMPT } from "./constants";
import type { FoodScanItem, FoodScanNutritionTotals, FoodScanResult } from "./types";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 900;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = { role: "system" | "user"; content: string | ContentPart[] };

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

interface AbacusDiscoveryResponse {
  result?: { proxyEndpoint?: string };
}

interface AbacusEvaluateResponse {
  result?: { content?: string | null };
}

let cachedAbacusProxy: string | undefined;

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
  const items = isFood && Array.isArray(value.items)
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

async function callOpenAI(buffer: Buffer, mimeType: string): Promise<string> {
  if (!env.AI_API_KEY) {
    throw new ApiError(503, "Besin görsel analizi için AI sağlayıcısı yapılandırılmamış.", {
      code: "AI_NOT_CONFIGURED",
    });
  }
  const response = await fetch(`${env.AI_API_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages: [
        { role: "system", content: FOOD_SCAN_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Bu görseli önce besin/öğün olup olmadığı açısından doğrula, sonra yalnızca geçerliyse yaklaşık besin analizini JSON olarak döndür." },
            { type: "image_url", image_url: { url: dataUrl(buffer, mimeType) } },
          ],
        },
      ] satisfies ChatMessage[],
      max_tokens: MAX_TOKENS,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch((error: unknown) => {
    logger.warn({ err: error }, "Food scan provider request failed");
    throw new ApiError(502, "Besin analiz servisine ulaşılamadı.", {
      code: "FOOD_SCAN_PROVIDER_UNREACHABLE",
    });
  });

  if (!response.ok) {
    logger.warn({ status: response.status }, "Food scan provider returned an error");
    throw new ApiError(502, "Besin analiz servisi hata verdi.", { code: "FOOD_SCAN_PROVIDER_ERROR" });
  }
  const body = (await response.json()) as OpenAIResponse;
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new ApiError(502, "Besin analiz servisinden boş yanıt geldi.", { code: "FOOD_SCAN_PROVIDER_EMPTY" });
  return content;
}

async function resolveAbacusProxy(): Promise<string> {
  if (cachedAbacusProxy) return cachedAbacusProxy;
  if (!env.ABACUS_API_KEY) {
    throw new ApiError(503, "Besin görsel analizi için AI sağlayıcısı yapılandırılmamış.", {
      code: "AI_NOT_CONFIGURED",
    });
  }
  const response = await fetch(env.ABACUS_API_ENDPOINT_URL, {
    method: "GET",
    headers: { APIKEY: env.ABACUS_API_KEY },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch((error: unknown) => {
    logger.warn({ err: error }, "Food scan Abacus discovery failed");
    throw new ApiError(502, "Besin analiz servisine ulaşılamadı.", {
      code: "FOOD_SCAN_PROVIDER_UNREACHABLE",
    });
  });
  if (!response.ok) throw new ApiError(502, "Besin analiz servisi hata verdi.", { code: "FOOD_SCAN_PROVIDER_ERROR" });
  const body = (await response.json()) as AbacusDiscoveryResponse;
  const endpoint = body.result?.proxyEndpoint;
  if (!endpoint) throw new ApiError(502, "Besin analiz servisinden geçersiz yanıt geldi.", { code: "FOOD_SCAN_PROVIDER_EMPTY" });
  cachedAbacusProxy = endpoint.replace(/\/+$/, "");
  return cachedAbacusProxy;
}

async function callAbacus(buffer: Buffer, mimeType: string): Promise<string> {
  const proxy = await resolveAbacusProxy();
  const response = await fetch(`${proxy}/api/evaluatePrompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", APIKEY: env.ABACUS_API_KEY as string },
    body: JSON.stringify({
      llmName: env.ABACUS_MODEL,
      systemMessage: FOOD_SCAN_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Görseli doğrula. Besin değilse kesinlikle isFood=false döndür; besinse yaklaşık porsiyon ve makroları JSON olarak döndür." },
            { type: "image_url", image_url: { url: dataUrl(buffer, mimeType) } },
          ],
        },
      ],
      maxTokens: MAX_TOKENS,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch((error: unknown) => {
    logger.warn({ err: error }, "Food scan Abacus request failed");
    throw new ApiError(502, "Besin analiz servisine ulaşılamadı.", {
      code: "FOOD_SCAN_PROVIDER_UNREACHABLE",
    });
  });
  if (!response.ok) throw new ApiError(502, "Besin analiz servisi hata verdi.", { code: "FOOD_SCAN_PROVIDER_ERROR" });
  const body = (await response.json()) as AbacusEvaluateResponse;
  const content = body.result?.content;
  if (!content) throw new ApiError(502, "Besin analiz servisinden boş yanıt geldi.", { code: "FOOD_SCAN_PROVIDER_EMPTY" });
  return content;
}

/** Uses the configured provider while keeping the food-scan service vendor-neutral. */
export async function analyzeFoodImageWithProvider(
  buffer: Buffer,
  mimeType: string,
): Promise<FoodScanResult> {
  const useAbacus =
    env.AI_PROVIDER === "abacus" ||
    (env.AI_PROVIDER !== "openai" && Boolean(env.ABACUS_API_KEY) && !env.AI_API_KEY);
  const raw = useAbacus ? await callAbacus(buffer, mimeType) : await callOpenAI(buffer, mimeType);
  return normalizeResult(raw);
}
