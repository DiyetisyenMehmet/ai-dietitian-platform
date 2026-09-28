import fs from "node:fs/promises";
import path from "node:path";

import { disconnectPrisma } from "../lib/prisma";
import {
  nutritionDataRepository,
  type ReferenceNutritionProvider,
} from "../modules/nutrition-data/nutrition-data.repository";
import { MICRONUTRIENT_KEYS } from "../modules/nutrition-data/micronutrients";
import type {
  CanonicalFood,
  CoreNutrientKey,
} from "../modules/nutrition-data/nutrition-data.types";

const REFERENCE_PROVIDERS = new Set<ReferenceNutritionProvider>(["CIQUAL", "COFID"]);
const REQUIRED_NUTRIENTS: readonly CoreNutrientKey[] = [
  "energyKcal",
  "proteinG",
  "carbohydratesG",
  "fatG",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableFiniteNumber(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

export function parseReferenceFoodLine(line: string): CanonicalFood {
  const parsed = JSON.parse(line) as unknown;
  if (!isRecord(parsed)) throw new Error("Reference nutrition row is not an object.");

  const provider = parsed.provider;
  if (provider !== "CIQUAL" && provider !== "COFID") {
    throw new Error(`Unsupported reference nutrition provider: ${String(provider)}`);
  }
  if (
    typeof parsed.externalId !== "string" ||
    !parsed.externalId.trim() ||
    typeof parsed.name !== "string" ||
    !parsed.name.trim() ||
    typeof parsed.displayNameTr !== "string" ||
    !parsed.displayNameTr.trim()
  ) {
    throw new Error(`${provider}: invalid food identity.`);
  }

  if (!isRecord(parsed.nutrientsPer100g)) {
    throw new Error(`${provider}:${parsed.externalId} has no nutrient object.`);
  }
  const nutrients = parsed.nutrientsPer100g;
  for (const key of [
    "energyKcal",
    "proteinG",
    "carbohydratesG",
    "fatG",
    "saturatedFatG",
    "sugarsG",
    "fiberG",
    "sodiumMg",
    "saltG",
  ] as const) {
    if (!isNullableFiniteNumber(nutrients[key])) {
      throw new Error(`${provider}:${parsed.externalId} has invalid ${key}.`);
    }
  }
  if (REQUIRED_NUTRIENTS.filter((key) => nutrients[key] !== null).length < 3) {
    throw new Error(`${provider}:${parsed.externalId} has insufficient core nutrition.`);
  }
  if (nutrients.micronutrients !== undefined && nutrients.micronutrients !== null) {
    if (!isRecord(nutrients.micronutrients)) {
      throw new Error(`${provider}:${parsed.externalId} has invalid micronutrients.`);
    }
    for (const key of MICRONUTRIENT_KEYS) {
      const value = nutrients.micronutrients[key];
      if (value !== undefined && !isNullableFiniteNumber(value)) {
        throw new Error(`${provider}:${parsed.externalId} has invalid micronutrient ${key}.`);
      }
    }
  }

  if (!isRecord(parsed.provenance)) {
    throw new Error(`${provider}:${parsed.externalId} has no provenance.`);
  }
  if (
    parsed.provenance.provider !== provider ||
    parsed.provenance.dataBasis !== "PER_100_G" ||
    typeof parsed.provenance.sourceReference !== "string" ||
    !parsed.provenance.sourceReference.trim()
  ) {
    throw new Error(`${provider}:${parsed.externalId} has invalid provenance.`);
  }

  return parsed as unknown as CanonicalFood;
}

async function loadFile(filePath: string): Promise<CanonicalFood[]> {
  const content = await fs.readFile(filePath, "utf8");
  const foods = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseReferenceFoodLine);

  if (foods.length < 1_000) {
    throw new Error(`${path.basename(filePath)} contains only ${foods.length} valid foods.`);
  }
  return foods;
}

export async function syncReferenceFiles(filePaths: readonly string[]): Promise<Record<string, number>> {
  if (filePaths.length === 0) throw new Error("At least one reference NDJSON file is required.");

  const grouped = new Map<ReferenceNutritionProvider, CanonicalFood[]>();
  for (const filePath of filePaths) {
    for (const food of await loadFile(filePath)) {
      const provider = food.provider as ReferenceNutritionProvider;
      if (!REFERENCE_PROVIDERS.has(provider)) {
        throw new Error(`Unexpected provider after validation: ${food.provider}`);
      }
      const foods = grouped.get(provider) ?? [];
      foods.push(food);
      grouped.set(provider, foods);
    }
  }

  const expiresAt = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
  const result: Record<string, number> = {};
  for (const [provider, foods] of grouped) {
    const unique = new Map(foods.map((food) => [food.externalId, food] as const));
    const snapshot = [...unique.values()];
    const count = await nutritionDataRepository.syncReferenceFoods(provider, snapshot, expiresAt);
    result[provider] = count;
  }
  return result;
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  try {
    const result = await syncReferenceFiles(files);
    process.stdout.write(`${JSON.stringify({ ok: true, imported: result })}\\n`);
  } finally {
    await disconnectPrisma();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Reference nutrition import failed: ${message}\\n`);
    process.exitCode = 1;
  });
}
