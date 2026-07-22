import { ApiError } from "../../../utils/api-error";
import { logger } from "../../../lib/logger";
import {
  ANALYSIS_SYSTEM_PROMPT,
  DISCLAIMER,
  EXTRACTION_SYSTEM_PROMPT,
  FORBIDDEN_AI_TERMS,
} from "../constants";
import { NUTRITION_PLAN_SYSTEM_PROMPT } from "../../nutrition-plan/constants";
import { DIETITIAN_CHAT_SYSTEM_PROMPT } from "../../ai-chat/constants";
import type {
  AnalysisContext,
  BiomarkerExplanation,
  BloodTestAnalysisResult,
  ExtractedBloodTestValue,
  ExtractedBloodTestValues,
  NormalizedBloodTestValue,
  NutritionImplication,
} from "../types";
import type {
  DailyPlan,
  NutritionPlanAIInput,
  NutritionPlanAIOutput,
  PlannedFood,
  PlannedMeal,
  PlanExplanations,
} from "../../nutrition-plan/types";
import type { DietitianChatAIInput, DietitianChatAIOutput } from "../../ai-chat/types";
import type { AIAdapterInfo, IAIAdapter } from "./ai-adapter.interface";

/** Configuration for an OpenAI-compatible endpoint. */
export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

/** Minimal shape of a chat/completions message content part (multimodal). */
type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Minimal shape of a chat/completions message. */
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

/** Minimal shape of the chat/completions response we rely on. */
interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * An {@link IAIAdapter} backed by any OpenAI-compatible chat/completions API
 * (OpenAI, Mistral, Together, Groq, …). It uses JSON-object response formatting
 * for reliable structured extraction and enforces Diewish's safety constraints
 * on all generated output.
 */
export class OpenAICompatibleAdapter implements IAIAdapter {
  public readonly info: AIAdapterInfo;
  private readonly config: OpenAICompatibleConfig;

  constructor(config: OpenAICompatibleConfig) {
    this.config = config;
    this.info = { provider: "openai-compatible", model: config.model };
  }

  /**
   * Calls the chat/completions endpoint and returns the assistant message
   * content as a string. Throws an {@link ApiError} on transport or provider
   * failures so callers get a consistent error envelope.
   */
  private async chat(messages: ChatMessage[], maxTokensOverride?: number): Promise<string> {
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          max_tokens: maxTokensOverride ?? this.config.maxTokens,
          temperature: this.config.temperature,
          response_format: { type: "json_object" },
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

  /**
   * Parses a JSON object out of a model response, tolerating markdown code
   * fences that some providers still wrap around JSON.
   */
  private parseJson<T>(raw: string): T {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Fallback: extract the first {...} block.
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end > start) {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      }
      throw new ApiError(502, "The AI provider returned malformed JSON.", {
        code: "AI_PROVIDER_MALFORMED",
        isOperational: false,
      });
    }
  }

  /**
   * Builds a data URL for an image buffer so it can be sent to a vision-capable
   * model via the `image_url` content part.
   */
  private toDataUrl(content: Buffer, mimeType: string): string {
    return `data:${mimeType};base64,${content.toString("base64")}`;
  }

  /** @inheritdoc */
  async extractBloodTestValues(
    content: string | Buffer,
    mimeType: string,
  ): Promise<ExtractedBloodTestValues> {
    const schemaHint =
      'Return JSON of the form {"values":[{"name":"string","rawValue":"string","unit":"string"}]}. ' +
      "Include every biomarker printed on the report. If a unit is absent, use an empty string.";

    const messages: ChatMessage[] = [{ role: "system", content: EXTRACTION_SYSTEM_PROMPT }];

    if (typeof content === "string") {
      messages.push({
        role: "user",
        content: `${schemaHint}\n\nLaboratory report text:\n"""\n${content}\n"""`,
      });
    } else {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `${schemaHint}\n\nExtract the values from this laboratory report image.`,
          },
          { type: "image_url", image_url: { url: this.toDataUrl(content, mimeType) } },
        ],
      });
    }

    const raw = await this.chat(messages);
    const parsed = this.parseJson<{ values?: ExtractedBloodTestValue[] }>(raw);
    const values: ExtractedBloodTestValue[] = Array.isArray(parsed.values)
      ? parsed.values
          .filter((v): v is ExtractedBloodTestValue => Boolean(v && v.name))
          .map((v) => ({
            name: String(v.name),
            rawValue: String(v.rawValue ?? ""),
            unit: v.unit ? String(v.unit) : undefined,
          }))
      : [];

    return { values, rawText: typeof content === "string" ? content : "" };
  }

  /**
   * Removes any forbidden medical term from a generated string, replacing it
   * with a neutral phrasing. This is a defensive guard on top of the system
   * prompt so Diewish never surfaces treatment/diagnosis language.
   */
  private sanitizeText(text: string): string {
    let out = text;
    for (const term of FORBIDDEN_AI_TERMS) {
      out = out.replace(
        new RegExp(`\\b${term}\\w*\\b`, "gi"),
        "[consult a healthcare professional]",
      );
    }
    return out;
  }

  /** @inheritdoc */
  async analyzeBloodTestValues(
    normalizedValues: NormalizedBloodTestValue[],
    context: AnalysisContext,
  ): Promise<BloodTestAnalysisResult> {
    const schemaHint = [
      "Return JSON with this exact shape:",
      "{",
      '  "explanations": [{"biomarkerCode":"string","biomarkerName":"string","status":"string","explanation":"string"}],',
      '  "nutritionImplications": [{"biomarkerCode":"string","biomarkerName":"string","implication":"string","suggestedFoods":["string"],"foodsToLimit":["string"]}],',
      '  "overallRecommendations": ["string"],',
      '  "summary": "string"',
      "}",
      "Provide nutritionImplications only for values whose status is not NORMAL.",
    ].join("\n");

    const payload = {
      context: {
        age: context.age ?? null,
        gender: context.gender ?? "ALL",
        country: context.country ?? null,
        dietaryPreference: context.dietaryPreference ?? null,
        healthConditions: context.healthConditions ?? [],
        allergies: context.allergies ?? [],
      },
      values: normalizedValues.map((v) => ({
        biomarkerCode: v.biomarkerCode,
        biomarkerName: v.biomarkerName,
        value: v.numericValue,
        unit: v.unit,
        status: v.status,
        referenceRange: v.referenceRange,
      })),
    };

    const messages: ChatMessage[] = [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: `${schemaHint}\n\nNormalized blood-test data:\n${JSON.stringify(payload)}`,
      },
    ];

    const raw = await this.chat(messages);
    const parsed = this.parseJson<Partial<BloodTestAnalysisResult>>(raw);

    const explanations: BiomarkerExplanation[] = Array.isArray(parsed.explanations)
      ? parsed.explanations.map((e) => ({
          biomarkerCode: String(e.biomarkerCode ?? ""),
          biomarkerName: String(e.biomarkerName ?? ""),
          status: e.status,
          explanation: this.sanitizeText(String(e.explanation ?? "")),
        }))
      : [];

    const nutritionImplications: NutritionImplication[] = Array.isArray(
      parsed.nutritionImplications,
    )
      ? parsed.nutritionImplications.map((n) => ({
          biomarkerCode: String(n.biomarkerCode ?? ""),
          biomarkerName: String(n.biomarkerName ?? ""),
          implication: this.sanitizeText(String(n.implication ?? "")),
          suggestedFoods: Array.isArray(n.suggestedFoods) ? n.suggestedFoods.map(String) : [],
          foodsToLimit: Array.isArray(n.foodsToLimit) ? n.foodsToLimit.map(String) : [],
        }))
      : [];

    const overallRecommendations: string[] = Array.isArray(parsed.overallRecommendations)
      ? parsed.overallRecommendations.map((r) => this.sanitizeText(String(r)))
      : [];

    const summaryBase = this.sanitizeText(String(parsed.summary ?? ""));
    const summary = `${summaryBase}\n\n${DISCLAIMER}`.trim();

    return { explanations, nutritionImplications, overallRecommendations, summary };
  }

  /** Coerces an unknown value to a finite number, defaulting to 0. */
  private num(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  /** Sanitizes and shapes a single generated meal. */
  private normalizeMeal(meal: Partial<PlannedMeal> | undefined): PlannedMeal {
    const foods: PlannedFood[] = Array.isArray(meal?.foods)
      ? meal.foods
          .filter((f): f is PlannedFood => Boolean(f && f.name))
          .map((f) => ({
            name: this.sanitizeText(String(f.name)),
            portion: this.sanitizeText(String(f.portion ?? "")),
            calories: this.num(f.calories),
          }))
      : [];

    return {
      name: this.sanitizeText(String(meal?.name ?? "")),
      time: String(meal?.time ?? ""),
      foods,
      calories: this.num(meal?.calories),
      proteinGrams: this.num(meal?.proteinGrams),
      carbsGrams: this.num(meal?.carbsGrams),
      fatGrams: this.num(meal?.fatGrams),
      explanation: this.sanitizeText(String(meal?.explanation ?? "")),
    };
  }

  /** Sanitizes and shapes a single generated daily plan. */
  private normalizeDailyPlan(day: Partial<DailyPlan> | undefined, index: number): DailyPlan {
    const meals = Array.isArray(day?.meals)
      ? day.meals.map((m) => this.normalizeMeal(m as Partial<PlannedMeal>))
      : [];
    return {
      dayLabel: this.sanitizeText(String(day?.dayLabel ?? `Day ${index + 1}`)),
      meals,
      totalCalories: this.num(day?.totalCalories),
      totalProteinGrams: this.num(day?.totalProteinGrams),
      totalCarbsGrams: this.num(day?.totalCarbsGrams),
      totalFatGrams: this.num(day?.totalFatGrams),
      ...(day?.notes ? { notes: this.sanitizeText(String(day.notes)) } : {}),
    };
  }

  /** @inheritdoc */
  async generateNutritionPlan(input: NutritionPlanAIInput): Promise<NutritionPlanAIOutput> {
    const schemaHint = [
      "Return JSON with this exact shape:",
      "{",
      '  "cycle": [{',
      '    "dayLabel": "Day 1",',
      '    "meals": [{',
      '      "name": "Breakfast", "time": "08:00",',
      '      "foods": [{"name": "string", "portion": "string", "calories": 0}],',
      '      "calories": 0, "proteinGrams": 0, "carbsGrams": 0, "fatGrams": 0,',
      '      "explanation": "why this meal fits the user"',
      "    }],",
      '    "totalCalories": 0, "totalProteinGrams": 0, "totalCarbsGrams": 0, "totalFatGrams": 0,',
      '    "notes": "optional short note"',
      "  }],",
      '  "explanations": {"calories": "string", "macros": "string", "water": "string", "mealTiming": "string", "overall": "string"},',
      '  "recommendations": ["string"],',
      '  "summary": "string"',
      "}",
      `Generate exactly ${input.cycleLengthDays} unique days in "cycle".`,
      "Each day's meals must sum close to the daily calorie and macro targets.",
      "Honor every allergy as a HARD exclusion — no allergen in any food, ever.",
    ].join("\n");

    const payload = {
      goal: input.goal,
      targets: {
        dailyCalories: input.dailyCalories,
        proteinGrams: input.proteinGrams,
        carbsGrams: input.carbsGrams,
        fatGrams: input.fatGrams,
        waterMl: input.waterMl,
      },
      mealTiming: input.mealTiming,
      dietaryPreference: input.dietaryPreference,
      allergies: input.allergies,
      healthConditions: input.healthConditions,
      bloodTestImplications: input.bloodTestImplications,
      cycleLengthDays: input.cycleLengthDays,
    };

    const messages: ChatMessage[] = [
      { role: "system", content: NUTRITION_PLAN_SYSTEM_PROMPT },
      { role: "user", content: `${schemaHint}\n\nPlan inputs:\n${JSON.stringify(payload)}` },
    ];

    const raw = await this.chat(messages);
    const parsed = this.parseJson<Partial<NutritionPlanAIOutput>>(raw);

    const cycle: DailyPlan[] = Array.isArray(parsed.cycle)
      ? parsed.cycle.map((day, index) => this.normalizeDailyPlan(day as Partial<DailyPlan>, index))
      : [];

    const rawExplanations = (parsed.explanations ?? {}) as Partial<PlanExplanations>;
    const explanations: PlanExplanations = {
      calories: this.sanitizeText(String(rawExplanations.calories ?? "")),
      macros: this.sanitizeText(String(rawExplanations.macros ?? "")),
      water: this.sanitizeText(String(rawExplanations.water ?? "")),
      mealTiming: this.sanitizeText(String(rawExplanations.mealTiming ?? "")),
      overall: this.sanitizeText(String(rawExplanations.overall ?? "")),
    };

    const recommendations: string[] = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((r) => this.sanitizeText(String(r)))
      : [];

    const summaryBase = this.sanitizeText(String(parsed.summary ?? ""));
    const summary = `${summaryBase}\n\n${DISCLAIMER}`.trim();

    return { cycle, explanations, recommendations, summary };
  }

  /** @inheritdoc */
  async chatWithDietitian(input: DietitianChatAIInput): Promise<DietitianChatAIOutput> {
    const schemaHint =
      'Respond ONLY with valid JSON of the form {"reply":"string"}. ' +
      "The reply must be nutrition/wellness guidance only.";

    const contextBlock =
      "Non-identifying nutrition context for this user (may be partial or empty):\n" +
      JSON.stringify(input.context);

    const messages: ChatMessage[] = [{ role: "system", content: DIETITIAN_CHAT_SYSTEM_PROMPT }];

    // Replay bounded, already-redacted history as prior turns.
    for (const turn of input.history) {
      messages.push({ role: turn.role, content: turn.content });
    }

    // Sprint 19: premium callers get a deeper, longer reply.
    const lengthHint = input.premium
      ? "Provide a thorough, well-structured reply with clear reasoning and concrete steps."
      : "Keep the reply concise and practical.";

    messages.push({
      role: "user",
      content: `${contextBlock}\n\n${schemaHint}\n${lengthHint}\n\nUser message:\n"""\n${input.message}\n"""`,
    });

    const raw = await this.chat(messages, input.premium ? 1200 : 500);
    const parsed = this.parseJson<{ reply?: string }>(raw);

    let reply = this.sanitizeText(String(parsed.reply ?? "")).trim();
    // Append the safety disclaimer once so every reply stays compliance-bound.
    if (reply.length > 0 && !reply.includes(DISCLAIMER)) {
      reply = `${reply}\n\n${DISCLAIMER}`;
    }

    return { reply };
  }
}
