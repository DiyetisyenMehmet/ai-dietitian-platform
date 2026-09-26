import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import type { NutrientValues } from "../nutrition-data/nutrition-data.types";
import type { FoodScanResult } from "./types";

const METADATA_BASE_URL = "http://metadata.google.internal/computeMetadata/v1";
const MAX_OUTPUT_TOKENS = 1_024;

export interface FoodNutritionEstimate {
  confidence: number;
  per100g: NutrientValues;
  rationale: string;
  researchMode?: "WEB_GROUNDED" | "MODEL_ESTIMATE";
  sourceReferences?: string[];
}

export type FoodNutritionEstimator = (analysis: FoodScanResult) => Promise<FoodNutritionEstimate | null>;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type Provider =
  | { kind: "vertex"; project: string; location: string; model: string }
  | { kind: "openai" | "abacus"; baseUrl: string; apiKey: string; model: string };

function nullNutrients(): NutrientValues {
  return {
    energyKcal: null,
    proteinG: null,
    carbohydratesG: null,
    fatG: null,
    saturatedFatG: null,
    sugarsG: null,
    fiberG: null,
    sodiumMg: null,
    saltG: null,
  };
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
}

function within(value: number | null, max: number): boolean {
  return value === null || (value >= 0 && value <= max);
}

/**
 * Last-resort AI estimates are accepted only when basic macros are complete and
 * internally plausible. They are never persisted into the verified food cache.
 */
export function sanitizeFoodNutritionEstimate(raw: unknown): FoodNutritionEstimate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const nutrientInput = value.per100g;
  if (!nutrientInput || typeof nutrientInput !== "object" || Array.isArray(nutrientInput)) return null;
  const input = nutrientInput as Record<string, unknown>;
  const nutrients = nullNutrients();
  nutrients.energyKcal = numberOrNull(input.energyKcal);
  nutrients.proteinG = numberOrNull(input.proteinG);
  nutrients.carbohydratesG = numberOrNull(input.carbohydratesG);
  nutrients.fatG = numberOrNull(input.fatG);
  nutrients.saturatedFatG = numberOrNull(input.saturatedFatG);
  nutrients.sugarsG = numberOrNull(input.sugarsG);
  nutrients.fiberG = numberOrNull(input.fiberG);
  nutrients.sodiumMg = numberOrNull(input.sodiumMg);
  nutrients.saltG = numberOrNull(input.saltG);

  if (
    nutrients.energyKcal === null ||
    nutrients.proteinG === null ||
    nutrients.carbohydratesG === null ||
    nutrients.fatG === null
  ) return null;
  if (
    !within(nutrients.energyKcal, 900) ||
    !within(nutrients.proteinG, 100) ||
    !within(nutrients.carbohydratesG, 100) ||
    !within(nutrients.fatG, 100) ||
    !within(nutrients.saturatedFatG, 100) ||
    !within(nutrients.sugarsG, 100) ||
    !within(nutrients.fiberG, 70) ||
    !within(nutrients.sodiumMg, 50_000) ||
    !within(nutrients.saltG, 125)
  ) return null;
  if (nutrients.saturatedFatG !== null && nutrients.saturatedFatG > nutrients.fatG + 1) return null;
  if (nutrients.sugarsG !== null && nutrients.sugarsG > nutrients.carbohydratesG + 2) return null;

  const macroEnergy = 4 * nutrients.proteinG + 4 * nutrients.carbohydratesG + 9 * nutrients.fatG;
  const tolerance = Math.max(100, nutrients.energyKcal * 0.35);
  if (Math.abs(macroEnergy - nutrients.energyKcal) > tolerance) return null;

  if (nutrients.sodiumMg !== null && nutrients.saltG === null) {
    nutrients.saltG = Math.round((nutrients.sodiumMg * 2.5 / 1000) * 100) / 100;
  } else if (nutrients.saltG !== null && nutrients.sodiumMg === null) {
    nutrients.sodiumMg = Math.round(nutrients.saltG * 400 * 100) / 100;
  } else if (nutrients.saltG !== null && nutrients.sodiumMg !== null && nutrients.saltG > 0.05) {
    const derivedSalt = nutrients.sodiumMg * 2.5 / 1000;
    if (Math.abs(derivedSalt - nutrients.saltG) > Math.max(0.5, nutrients.saltG * 0.35)) return null;
  }

  const rawConfidence = Number(value.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.max(0.2, Math.min(0.85, rawConfidence > 1 ? rawConfidence / 100 : rawConfidence))
    : 0.45;
  return {
    confidence: Math.round(confidence * 100) / 100,
    per100g: nutrients,
    rationale: String(value.rationale ?? "Tipik tarif ve porsiyon bileşimine dayalı Diewish tahmini.").trim().slice(0, 300),
    researchMode: "MODEL_ESTIMATE",
    sourceReferences: [],
  };
}

function activeProvider(): Provider | null {
  const configured = env.AI_PROVIDER;
  const kind = configured ?? (env.ABACUS_API_KEY && !env.AI_API_KEY ? "abacus" : env.AI_API_KEY ? "openai" : "vertex");
  if (kind === "vertex") {
    return { kind, project: env.GOOGLE_CLOUD_PROJECT.trim(), location: env.VERTEX_AI_LOCATION, model: env.VERTEX_AI_MODEL };
  }
  if (kind === "abacus") {
    if (!env.ABACUS_API_KEY) return null;
    return {
      kind,
      baseUrl: env.ABACUS_API_BASE_URL,
      apiKey: env.ABACUS_API_KEY,
      model: env.ABACUS_MODEL.trim().toUpperCase() === "OPENAI_GPT4O" ? "route-llm" : env.ABACUS_MODEL.trim(),
    };
  }
  if (!env.AI_API_KEY) return null;
  return { kind: "openai", baseUrl: env.AI_API_BASE_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL };
}

function promptFor(analysis: FoodScanResult, webResearch = false): string {
  const ingredients = analysis.ingredients
    .filter((item) => item.included)
    .map((item) => `${item.name}${item.estimatedGrams ? ` ~${item.estimatedGrams} g` : ""}`)
    .slice(0, 12)
    .join(", ");
  return [
    webResearch
      ? "Aşağıdaki tanınmış gıdanın besin değerlerini web üzerinde araştır. Mümkünse resmi veri tabanları, üretici/etiket bilgileri ve güvenilir beslenme kaynaklarını karşılaştır."
      : "Aşağıdaki tanınmış gıda için yalnızca güvenilir bir veri kaynağı bulunamadığında kullanılacak son çare besin tahmini üret.",
    webResearch
      ? "Kaynaklar arasında tarif farkı varsa tek bir kesin değer iddia etme; tipik 100 g değerlerini muhafazakâr biçimde sentezle."
      : "Bu bir kaynak doğrulaması değildir. Tipik tarif/bileşim bilgisinden 100 g başına yaklaşık değerleri tahmin et.",
    webResearch
      ? "Webde bulamadığın alanı uydurma; temel makrolar için makul bir sentez üret ve kaynak araştırmasına dayandığını rationale içinde kısaca belirt."
      : "Sahte kaynak, araştırma, URL veya kesinlik iddiası üretme. Makrolar matematiksel olarak tutarlı olmalı.",
    `Gıda: ${analysis.dishName}`,
    `Görsel porsiyon: ${analysis.estimatedGrams ?? "belirsiz"} g`,
    `Tanınan bileşenler: ${ingredients || "belirlenemedi"}`,
    "Yalnız JSON döndür: {\"confidence\":0.2-0.85,\"rationale\":\"kısa açıklama\",\"per100g\":{\"energyKcal\":number,\"proteinG\":number,\"carbohydratesG\":number,\"fatG\":number,\"saturatedFatG\":number|null,\"sugarsG\":number|null,\"fiberG\":number|null,\"sodiumMg\":number|null,\"saltG\":number|null}}",
  ].join("\n");
}

interface GroundedText {
  text: string;
  sources: string[];
}

function uniqueHttpSources(values: readonly unknown[]): string[] {
  const sources: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed) || sources.includes(trimmed)) continue;
    sources.push(trimmed);
    if (sources.length >= 8) break;
  }
  return sources;
}

async function requestOpenAIWeb(
  provider: Extract<Provider, { kind: "openai" }>,
  prompt: string,
): Promise<GroundedText> {
  const response = await fetch(`${provider.baseUrl.replace(/\/+$/, "")}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      tools: [{ type: "web_search", search_context_size: "medium" }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      input: prompt,
    }),
    signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OpenAI web research HTTP ${response.status}`);
  const body = await response.json() as {
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
        annotations?: Array<{ type?: string; url?: string }>;
      }>;
      action?: { sources?: Array<{ url?: string }> };
    }>;
  };
  const output = body.output ?? [];
  const text = output
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("")
    .trim();
  const sources = uniqueHttpSources([
    ...output.flatMap((item) => (item.action?.sources ?? []).map((source) => source.url)),
    ...output.flatMap((item) =>
      (item.content ?? []).flatMap((content) =>
        (content.annotations ?? []).map((annotation) => annotation.url),
      ),
    ),
  ]);
  return { text, sources };
}

async function requestOpenAI(provider: Extract<Provider, { kind: "openai" | "abacus" }>, prompt: string): Promise<string> {
  const response = await fetch(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: "You are Diewish's conservative food nutrition estimation fallback. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI estimate provider HTTP ${response.status}`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
  return body.choices?.[0]?.message?.content?.trim() ?? "";
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function metadataText(path: string, fetcher: FetchLike = fetch): Promise<string> {
  const response = await fetcher(`${METADATA_BASE_URL}${path}`, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
  return (await response.text()).trim();
}

async function vertexProject(configured: string): Promise<string> {
  return configured || metadataText("/project/project-id");
}

async function vertexToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const response = await fetch(`${METADATA_BASE_URL}/instance/service-accounts/default/token`, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Metadata token HTTP ${response.status}`);
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Metadata token missing");
  tokenCache = { token: body.access_token, expiresAt: Date.now() + Math.max(60, body.expires_in ?? 300) * 1000 };
  return body.access_token;
}

async function requestVertexWeb(
  provider: Extract<Provider, { kind: "vertex" }>,
  prompt: string,
): Promise<GroundedText> {
  const [project, token] = await Promise.all([vertexProject(provider.project), vertexToken()]);
  const host = provider.location === "global"
    ? "aiplatform.googleapis.com"
    : `${provider.location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(provider.location)}/publishers/google/models/${encodeURIComponent(provider.model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: "You are Diewish's food nutrition research fallback. Use Google Search, compare credible sources, and return valid JSON only.",
        }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.1, maxOutputTokens: MAX_OUTPUT_TOKENS },
    }),
    signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Vertex web research HTTP ${response.status}`);
  const body = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string } }>;
      };
    }>;
  };
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  const sources = uniqueHttpSources(
    candidate?.groundingMetadata?.groundingChunks?.map((chunk) => chunk.web?.uri) ?? [],
  );
  return { text, sources };
}

async function requestVertex(provider: Extract<Provider, { kind: "vertex" }>, prompt: string): Promise<string> {
  const [project, token] = await Promise.all([vertexProject(provider.project), vertexToken()]);
  const host = provider.location === "global" ? "aiplatform.googleapis.com" : `${provider.location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(provider.location)}/publishers/google/models/${encodeURIComponent(provider.model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "You are Diewish's conservative food nutrition estimation fallback. Return valid JSON only." }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: MAX_OUTPUT_TOKENS, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Vertex AI estimate HTTP ${response.status}`);
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

export const estimateFoodNutritionWithAi: FoodNutritionEstimator = async (analysis) => {
  const provider = activeProvider();
  if (!provider || !analysis.dishName.trim()) return null;

  if (provider.kind === "vertex" || provider.kind === "openai") {
    try {
      const grounded = provider.kind === "vertex"
        ? await requestVertexWeb(provider, promptFor(analysis, true))
        : await requestOpenAIWeb(provider, promptFor(analysis, true));
      const parsed = parseJsonObject(grounded.text);
      const estimate = sanitizeFoodNutritionEstimate(parsed);
      if (estimate && grounded.sources.length > 0) {
        logger.info(
          {
            event: "food_nutrition_web_fallback_success",
            provider: provider.kind,
            sourceCount: grounded.sources.length,
            dishNameLength: analysis.dishName.length,
          },
          "Food nutrition web research fallback succeeded",
        );
        return {
          ...estimate,
          researchMode: "WEB_GROUNDED",
          sourceReferences: grounded.sources,
          confidence: Math.min(0.82, estimate.confidence),
        };
      }
      logger.warn(
        {
          event: "food_nutrition_web_fallback_rejected",
          provider: provider.kind,
          sourceCount: grounded.sources.length,
          dishNameLength: analysis.dishName.length,
        },
        "Food nutrition web research fallback did not produce a grounded valid estimate",
      );
    } catch (error) {
      logger.warn(
        { err: error, event: "food_nutrition_web_fallback_unavailable", provider: provider.kind },
        "Food nutrition web research fallback unavailable",
      );
    }
  }

  try {
    const prompt = promptFor(analysis, false);
    const raw = provider.kind === "vertex"
      ? await requestVertex(provider, prompt)
      : await requestOpenAI(provider, prompt);
    const parsed = parseJsonObject(raw);
    const estimate = sanitizeFoodNutritionEstimate(parsed);
    if (!estimate) {
      logger.warn(
        { dishNameLength: analysis.dishName.length },
        "Food nutrition model fallback rejected by sanity checks",
      );
    }
    return estimate;
  } catch (error) {
    logger.warn(
      { err: error, dishNameLength: analysis.dishName.length },
      "Food nutrition model fallback unavailable",
    );
    return null;
  }
};
