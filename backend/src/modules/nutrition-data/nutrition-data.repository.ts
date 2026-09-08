import { prisma } from "../../lib/prisma";
import type { CanonicalFood } from "./nutrition-data.types";

interface FoodRow {
  payload: unknown;
  expires_at: Date;
}

interface ScanRow {
  barcode: string;
  provider: string | null;
  product_name: string | null;
  payload: unknown;
  scanned_at: Date;
}

interface FavoriteRow {
  barcode: string;
  provider: string | null;
  product_name: string | null;
  payload: unknown;
  created_at: Date;
}

function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9çğıöşü]+/gi, " ")
    .trim();
}

function asFood(value: unknown): CanonicalFood | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CanonicalFood>;
  if (!candidate.externalId || !candidate.provider || !candidate.name || !candidate.nutrientsPer100g) return null;
  return candidate as CanonicalFood;
}

/** Persistent server-side nutrition cache and user-scoped barcode history. */
export const nutritionDataRepository = {
  async getFreshBarcode(barcode: string, now = new Date()): Promise<CanonicalFood | null> {
    const rows = await prisma.$queryRaw<FoodRow[]>`
      SELECT payload, expires_at
      FROM nutrition_foods
      WHERE barcode = ${barcode} AND expires_at > ${now}
      ORDER BY retrieved_at DESC
      LIMIT 1
    `;
    return rows[0] ? asFood(rows[0].payload) : null;
  },

  async searchLocal(query: string, limit: number, now = new Date()): Promise<CanonicalFood[]> {
    const normalized = normalizeAlias(query);
    if (!normalized) return [];
    const pattern = `%${normalized}%`;
    const rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
      SELECT ranked.payload
      FROM (
        SELECT DISTINCT ON (f.provider, f.external_id)
          f.provider,
          f.external_id,
          f.payload,
          f.retrieved_at
        FROM nutrition_foods f
        LEFT JOIN nutrition_food_aliases a
          ON a.provider = f.provider AND a.external_id = f.external_id
        WHERE f.expires_at > ${now}
          AND (
            LOWER(f.display_name_tr) LIKE ${pattern}
            OR LOWER(f.name) LIKE ${pattern}
            OR a.normalized_alias LIKE ${pattern}
          )
        ORDER BY f.provider, f.external_id, f.retrieved_at DESC
      ) ranked
      ORDER BY ranked.retrieved_at DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => asFood(row.payload)).filter((food): food is CanonicalFood => food !== null);
  },

  async upsertFood(food: CanonicalFood, expiresAt: Date): Promise<void> {
    const payload = JSON.stringify(food);
    await prisma.$executeRaw`
      INSERT INTO nutrition_foods
        (provider, external_id, barcode, name, display_name_tr, brand, payload, retrieved_at, expires_at, updated_at)
      VALUES
        (${food.provider}, ${food.externalId}, ${food.barcode}, ${food.name}, ${food.displayNameTr}, ${food.brand}, ${payload}::jsonb, ${new Date(food.provenance.retrievedAt)}, ${expiresAt}, CURRENT_TIMESTAMP)
      ON CONFLICT (provider, external_id) DO UPDATE SET
        barcode = EXCLUDED.barcode,
        name = EXCLUDED.name,
        display_name_tr = EXCLUDED.display_name_tr,
        brand = EXCLUDED.brand,
        payload = EXCLUDED.payload,
        retrieved_at = EXCLUDED.retrieved_at,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP
    `;

    const aliases = new Set([food.name, food.displayNameTr]);
    for (const alias of aliases) {
      const normalized = normalizeAlias(alias);
      if (!normalized) continue;
      const confidence = alias === food.displayNameTr ? 0.95 : 0.8;
      await prisma.$executeRaw`
        INSERT INTO nutrition_food_aliases (alias, normalized_alias, provider, external_id, confidence)
        VALUES (${alias}, ${normalized}, ${food.provider}, ${food.externalId}, ${confidence})
        ON CONFLICT (normalized_alias, provider, external_id) DO UPDATE SET
          alias = EXCLUDED.alias,
          confidence = GREATEST(nutrition_food_aliases.confidence, EXCLUDED.confidence)
      `;
    }
  },

  async recordBarcodeScan(userId: string, barcode: string, food: CanonicalFood | null): Promise<void> {
    const payload = food ? JSON.stringify(food) : null;
    await prisma.$executeRaw`
      INSERT INTO nutrition_barcode_scans (user_id, barcode, provider, product_name, payload)
      VALUES (${userId}, ${barcode}, ${food?.provider ?? null}, ${food?.displayNameTr ?? food?.name ?? null}, ${payload}::jsonb)
    `;
  },

  async listRecentScans(userId: string, limit: number): Promise<Array<{
    barcode: string;
    provider: string | null;
    productName: string | null;
    food: CanonicalFood | null;
    scannedAt: string;
  }>> {
    const rows = await prisma.$queryRaw<ScanRow[]>`
      SELECT barcode, provider, product_name, payload, scanned_at
      FROM nutrition_barcode_scans
      WHERE user_id = ${userId}
      ORDER BY scanned_at DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      barcode: row.barcode,
      provider: row.provider,
      productName: row.product_name,
      food: asFood(row.payload),
      scannedAt: row.scanned_at.toISOString(),
    }));
  },

  async setFavorite(userId: string, barcode: string, food: CanonicalFood | null, favorite: boolean): Promise<void> {
    if (!favorite) {
      await prisma.$executeRaw`DELETE FROM nutrition_food_favorites WHERE user_id = ${userId} AND barcode = ${barcode}`;
      return;
    }
    const payload = food ? JSON.stringify(food) : null;
    await prisma.$executeRaw`
      INSERT INTO nutrition_food_favorites (user_id, barcode, provider, product_name, payload)
      VALUES (${userId}, ${barcode}, ${food?.provider ?? null}, ${food?.displayNameTr ?? food?.name ?? null}, ${payload}::jsonb)
      ON CONFLICT (user_id, barcode) DO UPDATE SET
        provider = EXCLUDED.provider,
        product_name = EXCLUDED.product_name,
        payload = EXCLUDED.payload
    `;
  },

  async listFavorites(userId: string, limit: number): Promise<Array<{
    barcode: string;
    provider: string | null;
    productName: string | null;
    food: CanonicalFood | null;
    createdAt: string;
  }>> {
    const rows = await prisma.$queryRaw<FavoriteRow[]>`
      SELECT barcode, provider, product_name, payload, created_at
      FROM nutrition_food_favorites
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      barcode: row.barcode,
      provider: row.provider,
      productName: row.product_name,
      food: asFood(row.payload),
      createdAt: row.created_at.toISOString(),
    }));
  },
};

export type NutritionDataRepository = typeof nutritionDataRepository;
