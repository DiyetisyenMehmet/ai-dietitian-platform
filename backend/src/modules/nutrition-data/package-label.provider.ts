import sharp from "sharp";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { ApiError } from "../../utils/api-error";
import { resolveFoodVisionProviderKind, resolveVertexProjectId } from "../food-scan/food-vision.provider";
import { normalizePackageLabelDraft, type PackageLabelDraft } from "./package-label";

const MAX_ATTEMPTS = 2;
const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const SYSTEM_PROMPT = `Sen Diewish paketli gıda besin etiketi okuma motorusun. Yalnız görselde gerçekten okunabilen bilgileri yapılandırılmış JSON'a aktar. Eksik veya okunamayan hiçbir sayı, ürün adı, içerik ya da alerjeni tahmin etme. Birden fazla besin sütunu varsa mümkünse 100 g/100 ml sütununu seç; yalnız porsiyon sütunu varsa PER_SERVING kullan ve basılı porsiyon gramını aktar. Enerji için kcal ve kJ basılıysa ikisini de aktar. Tuz ile sodyumu birbirine dönüştürme; yalnız etikette yazanı aktar. ingredients ve allergens alanları yalnız görünür metinden gelsin. confidence 0..1 aralığında genel OCR güvenidir.`;
const USER_PROMPT = "Bu paketli gıda etiketini oku. Görselde olmayan hiçbir besin değerini üretme. JSON şemasına göre yalnız görünen bilgileri döndür.";

export const PACKAGE_LABEL_VERTEX_SCHEMA = {
  type: "OBJECT",
  properties: {
    productName: { type: "STRING", nullable: true },
    brand: { type: "STRING", nullable: true },
    quantity: { type: "STRING", nullable: true },
    basis: { type: "STRING", enum: ["PER_100_G", "PER_SERVING"], nullable: true },
    servingGrams: { type: "NUMBER", nullable: true },
    energyKj: { type: "NUMBER", nullable: true },
    nutrients: {
      type: "OBJECT",
      properties: {
        energyKcal: { type: "NUMBER", nullable: true },
        proteinG: { type: "NUMBER", nullable: true },
        carbohydratesG: { type: "NUMBER", nullable: true },
        fatG: { type: "NUMBER", nullable: true },
        saturatedFatG: { type: "NUMBER", nullable: true },
        sugarsG: { type: "NUMBER", nullable: true },
        fiberG: { type: "NUMBER", nullable: true },
        sodiumMg: { type: "NUMBER", nullable: true },
        saltG: { type: "NUMBER", nullable: true },
      },
      required: ["energyKcal", "proteinG", "carbohydratesG", "fatG", "saturatedFatG", "sugarsG", "fiberG", "sodiumMg", "saltG"],
    },
    ingredients: { type: "ARRAY", items: { type: "STRING" } },
    allergens: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "NUMBER" },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["productName", "brand", "quantity", "basis", "servingGrams", "energyKj", "nutrients", "ingredients", "allergens", "confidence", "warnings"],
} as const;

type VertexResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
};

type MetadataToken = { access_token?: string; expires_in?: number };
let tokenCache: { value: string; expiresAt: number } | null = null;

function parseJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)) as unknown; } catch { /* handled below */ }
    }
    throw new ApiError(502, "Besin etiketi okuma servisi geçersiz yanıt verdi.", { code: "PACKAGE_LABEL_MALFORMED" });
  }
}

async function normalizedImage(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const image = await sharp(buffer, { failOn: "error" })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    return { buffer: image, mimeType: "image/jpeg" };
  } catch {
    throw new ApiError(422, "Besin etiketi görseli okunamadı.", { code: "PACKAGE_LABEL_IMAGE_UNREADABLE" });
  }
}

async function metadataToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  let response: Response;
  try {
    response = await fetch(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    logger.warn({ err: error }, "Package label Vertex token request failed");
    throw new ApiError(503, "Besin etiketi AI kimliği kullanılamıyor.", { code: "VERTEX_CREDENTIALS_UNAVAILABLE" });
  }
  if (!response.ok) throw new ApiError(503, "Besin etiketi AI kimliği kullanılamıyor.", { code: "VERTEX_CREDENTIALS_UNAVAILABLE" });
  const body = await response.json() as MetadataToken;
  if (!body.access_token) throw new ApiError(503, "Besin etiketi AI kimliği kullanılamıyor.", { code: "VERTEX_CREDENTIALS_UNAVAILABLE" });
  tokenCache = { value: body.access_token, expiresAt: Date.now() + Math.max(60, body.expires_in ?? 300) * 1000 };
  return tokenCache.value;
}

function vertexUrl(project: string): string {
  const location = env.VERTEX_AI_LOCATION;
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(env.VERTEX_AI_MODEL)}:generateContent`;
}

async function requestVertex(buffer: Buffer, mimeType: string): Promise<string> {
  const project = await resolveVertexProjectId(env.GOOGLE_CLOUD_PROJECT);
  const token = await metadataToken();
  const isGemini3 = /^gemini-3(?:[.-]|$)/i.test(env.VERTEX_AI_MODEL);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(vertexUrl(project), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: USER_PROMPT }, { inlineData: { mimeType, data: buffer.toString("base64") } }] }],
          generationConfig: {
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            responseSchema: PACKAGE_LABEL_VERTEX_SCHEMA,
            ...(isGemini3 ? { thinkingConfig: { thinkingLevel: "LOW" } } : { temperature: 0 }),
          },
        }),
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) continue;
      logger.warn({ err: error }, "Package label Vertex request failed");
      throw new ApiError(502, "Besin etiketi okuma servisine ulaşılamadı.", { code: "PACKAGE_LABEL_PROVIDER_UNREACHABLE" });
    }
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) continue;
      throw new ApiError(response.status === 401 || response.status === 403 ? 503 : 502, "Besin etiketi okuma servisi kullanılamıyor.", { code: "PACKAGE_LABEL_PROVIDER_ERROR" });
    }
    const body = await response.json() as VertexResponse;
    if (body.candidates?.[0]?.finishReason === "MAX_TOKENS" && attempt < MAX_ATTEMPTS) continue;
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (text) return text;
    if (body.promptFeedback?.blockReason) throw new ApiError(422, "Etiket görseli güvenli biçimde işlenemedi.", { code: "PACKAGE_LABEL_BLOCKED" });
  }
  throw new ApiError(502, "Besin etiketi okuma servisi boş yanıt verdi.", { code: "PACKAGE_LABEL_PROVIDER_EMPTY" });
}

async function requestOpenAiCompatible(buffer: Buffer, mimeType: string, kind: "openai" | "abacus"): Promise<string> {
  const apiKey = kind === "abacus" ? env.ABACUS_API_KEY : env.AI_API_KEY;
  if (!apiKey) throw new ApiError(503, "Besin etiketi AI sağlayıcısı yapılandırılmamış.", { code: "AI_NOT_CONFIGURED" });
  const baseUrl = kind === "abacus" ? env.ABACUS_API_BASE_URL : env.AI_API_BASE_URL;
  const model = kind === "abacus" ? env.ABACUS_MODEL : env.AI_MODEL;
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const imageUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: [{ type: "text", text: USER_PROMPT }, { type: "image_url", image_url: { url: imageUrl } }] },
          ],
          max_tokens: 4096,
          temperature: 0,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) continue;
      logger.warn({ err: error, kind }, "Package label provider request failed");
      throw new ApiError(502, "Besin etiketi okuma servisine ulaşılamadı.", { code: "PACKAGE_LABEL_PROVIDER_UNREACHABLE" });
    }
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) continue;
      throw new ApiError(response.status === 401 || response.status === 403 ? 503 : 502, "Besin etiketi okuma servisi kullanılamıyor.", { code: "PACKAGE_LABEL_PROVIDER_ERROR" });
    }
    const body = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (content) return content;
  }
  throw new ApiError(502, "Besin etiketi okuma servisi boş yanıt verdi.", { code: "PACKAGE_LABEL_PROVIDER_EMPTY" });
}

export async function analyzePackageLabelImage(buffer: Buffer): Promise<PackageLabelDraft> {
  const image = await normalizedImage(buffer);
  const kind = resolveFoodVisionProviderKind({
    aiProvider: env.AI_PROVIDER,
    aiApiKey: env.AI_API_KEY,
    abacusApiKey: env.ABACUS_API_KEY,
  });
  const raw = kind === "vertex"
    ? await requestVertex(image.buffer, image.mimeType)
    : await requestOpenAiCompatible(image.buffer, image.mimeType, kind);
  const draft = normalizePackageLabelDraft(parseJson(raw));
  logger.info({ basis: draft.basis, confidence: draft.confidence, hasProductName: Boolean(draft.productName) }, "Package nutrition label extracted");
  return draft;
}
