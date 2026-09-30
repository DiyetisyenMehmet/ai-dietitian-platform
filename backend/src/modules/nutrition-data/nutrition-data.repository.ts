import crypto from "node:crypto";

import { prisma } from "../../lib/prisma";
import { buildPackageLabelConsensus } from "./nutrition-learning";
import type { CanonicalFood, NutrientValues } from "./nutrition-data.types";

interface FoodRow {
  payload: unknown;
  expires_at: Date;
  last_validated_at: Date | null;
  payload_hash: string | null;
}

interface CatalogFoodRow extends FoodRow {
  is_stale: boolean;
  match_rank: number;
}

interface ConfirmedLabelRow {
  user_id: string;
  payload: unknown;
}

interface ScanRow {
  barcode: string;
  provider: string | null;
  product_name: string | null;
  payload: unknown;
  scanned_at: Date;
  last_viewed_at?: Date | null;
}

interface FavoriteRow {
  barcode: string;
  provider: string | null;
  product_name: string | null;
  payload: unknown;
  created_at: Date;
}

interface UnifiedScanRow {
  history_id: string;
  scan_type: "PHOTO" | "BARCODE";
  barcode: string | null;
  product_name: string | null;
  payload: unknown;
  scanned_at: Date;
  last_viewed_at: Date | null;
}

export type ReferenceNutritionProvider = Extract<CanonicalFood["provider"], "CIQUAL" | "COFID">;

export interface PhotoScanHistoryInput {
  dishName: string;
  estimatedPortion: string;
  estimatedGrams: number | null;
  totals: NutrientValues;
  ingredients: Array<{
    name: string;
    estimatedGrams: number | null;
    included: boolean;
  }>;
  disclaimer: string;
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

function hydrateFood(row: FoodRow, stale: boolean): CanonicalFood | null {
  const food = asFood(row.payload);
  if (!food) return null;
  return {
    ...food,
    provenance: {
      ...food.provenance,
      lastValidatedAt: row.last_validated_at?.toISOString() ?? food.provenance.lastValidatedAt ?? null,
      dataHash: row.payload_hash ?? food.provenance.dataHash ?? null,
      stale,
    },
  };
}

function payloadHash(payload: string): string {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function asPhotoScan(value: unknown): PhotoScanHistoryInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<PhotoScanHistoryInput>;
  if (
    typeof candidate.dishName !== "string" ||
    typeof candidate.estimatedPortion !== "string" ||
    !candidate.totals ||
    typeof candidate.totals !== "object" ||
    !Array.isArray(candidate.ingredients)
  ) {
    return null;
  }
  return candidate as PhotoScanHistoryInput;
}

/** Persistent server-side nutrition cache and user-scoped barcode history. */
export const nutritionDataRepository = {
  async getFreshBarcode(barcode: string, now = new Date()): Promise<CanonicalFood | null> {
    const rows = await prisma.$queryRaw<FoodRow[]>`
      SELECT payload, expires_at, last_validated_at, payload_hash
      FROM nutrition_foods
      WHERE barcode = ${barcode} AND expires_at > ${now}
      ORDER BY
        CASE
          WHEN provider = 'OPEN_FOOD_FACTS' THEN 0
          WHEN provider = 'USDA' THEN 1
          WHEN provider = 'CNF' THEN 2
          WHEN provider = 'DIEWISH' THEN 3
          ELSE 4
        END,
        retrieved_at DESC
      LIMIT 1
    `;
    return rows[0] ? hydrateFood(rows[0], false) : null;
  },

  /** User-confirmed package labels are deliberately user-scoped and never enter the global source cache. */
  async getUserConfirmedBarcode(userId: string, barcode: string): Promise<CanonicalFood | null> {
    const rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
      SELECT payload
      FROM nutrition_barcode_scans
      WHERE user_id = ${userId}
        AND barcode = ${barcode}
        AND provider = 'DIEWISH'
        AND payload IS NOT NULL
        AND payload->'provenance'->>'sourceReference' = 'USER_CONFIRMED_PACKAGE_LABEL'
      ORDER BY scanned_at DESC
      LIMIT 1
    `;
    return rows[0] ? asFood(rows[0].payload) : null;
  },

  /**
   * Builds shared package knowledge only when independent users confirmed the
   * same barcode nutrition panel. Raw label images are never stored here.
   */
  async getUserConfirmedBarcodeConsensus(
    barcode: string,
    minimumDistinctUsers = 3,
  ): Promise<CanonicalFood | null> {
    const rows = await prisma.$queryRaw<ConfirmedLabelRow[]>`
      SELECT user_id, payload
      FROM nutrition_barcode_scans
      WHERE barcode = ${barcode}
        AND provider = 'DIEWISH'
        AND payload IS NOT NULL
        AND payload->'provenance'->>'sourceReference' = 'USER_CONFIRMED_PACKAGE_LABEL'
      ORDER BY scanned_at DESC
      LIMIT 100
    `;

    return buildPackageLabelConsensus(
      rows
        .map((row) => {
          const food = asFood(row.payload);
          return food ? { userId: row.user_id, food } : null;
        })
        .filter((value): value is { userId: string; food: CanonicalFood } => value !== null),
      minimumDistinctUsers,
    );
  },

  /** Most recently validated expired record, used only when live providers fail. */
  async getStaleBarcode(barcode: string, now = new Date()): Promise<CanonicalFood | null> {
    const rows = await prisma.$queryRaw<FoodRow[]>`
      SELECT payload, expires_at, last_validated_at, payload_hash
      FROM nutrition_foods
      WHERE barcode = ${barcode} AND expires_at <= ${now}
      ORDER BY COALESCE(last_validated_at, retrieved_at) DESC
      LIMIT 1
    `;
    return rows[0] ? hydrateFood(rows[0], true) : null;
  },

  async searchLocal(query: string, limit: number, now = new Date()): Promise<CanonicalFood[]> {
    const normalized = normalizeAlias(query);
    if (!normalized) return [];
    const pattern = `%${normalized}%`;
    const rows = await prisma.$queryRaw<Array<FoodRow>>`
      SELECT ranked.payload, ranked.expires_at, ranked.last_validated_at, ranked.payload_hash
      FROM (
        SELECT DISTINCT ON (f.provider, f.external_id)
          f.provider,
          f.external_id,
          f.payload,
          f.retrieved_at,
          f.expires_at,
          f.last_validated_at,
          f.payload_hash
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
    return rows.map((row) => hydrateFood(row, false)).filter((food): food is CanonicalFood => food !== null);
  },

  /**
   * Searches only Diewish's stored barcode catalog. Used by type-ahead product
   * discovery so keystrokes never fan out to external nutrition providers.
   */
  async searchCatalogProducts(query: string, limit: number, now = new Date()): Promise<CanonicalFood[]> {
    const normalized = normalizeAlias(query);
    if (!normalized) return [];
    const pattern = `%${normalized}%`;
    const prefix = `${normalized}%`;
    const rows = await prisma.$queryRaw<CatalogFoodRow[]>`
      SELECT
        ranked.payload,
        ranked.expires_at,
        ranked.last_validated_at,
        ranked.payload_hash,
        ranked.is_stale,
        ranked.match_rank
      FROM (
        SELECT DISTINCT ON (f.barcode)
          f.barcode,
          f.payload,
          f.expires_at,
          f.last_validated_at,
          f.payload_hash,
          (f.expires_at <= ${now}) AS is_stale,
          CASE
            WHEN LOWER(COALESCE(f.brand, '') || ' ' || COALESCE(f.display_name_tr, '')) = ${normalized} THEN 0
            WHEN LOWER(COALESCE(f.display_name_tr, '')) = ${normalized} THEN 1
            WHEN LOWER(COALESCE(f.name, '')) = ${normalized} THEN 2
            WHEN LOWER(COALESCE(f.brand, '')) = ${normalized} THEN 3
            WHEN LOWER(COALESCE(f.display_name_tr, '')) LIKE ${prefix} THEN 4
            WHEN LOWER(COALESCE(f.brand, '')) LIKE ${prefix} THEN 5
            WHEN LOWER(COALESCE(f.brand, '') || ' ' || COALESCE(f.display_name_tr, '')) LIKE ${pattern} THEN 6
            WHEN LOWER(COALESCE(f.name, '')) LIKE ${pattern} THEN 7
            ELSE 8
          END AS match_rank
        FROM nutrition_foods f
        LEFT JOIN nutrition_food_aliases a
          ON a.provider = f.provider AND a.external_id = f.external_id
        WHERE f.barcode IS NOT NULL
          AND f.barcode <> ''
          AND (
            LOWER(COALESCE(f.display_name_tr, '')) LIKE ${pattern}
            OR LOWER(COALESCE(f.name, '')) LIKE ${pattern}
            OR LOWER(COALESCE(f.brand, '')) LIKE ${pattern}
            OR LOWER(COALESCE(f.brand, '') || ' ' || COALESCE(f.display_name_tr, '')) LIKE ${pattern}
            OR a.normalized_alias LIKE ${pattern}
          )
        ORDER BY
          f.barcode,
          CASE
            WHEN f.provider = 'DIEWISH' THEN 0
            WHEN f.provider = 'OPEN_FOOD_FACTS' THEN 1
            WHEN f.provider = 'USDA' THEN 2
            WHEN f.provider = 'CNF' THEN 3
            WHEN f.provider = 'CIQUAL' THEN 4
            WHEN f.provider = 'COFID' THEN 5
            ELSE 6
          END,
          (f.expires_at > ${now}) DESC,
          COALESCE(f.last_validated_at, f.retrieved_at) DESC
      ) ranked
      ORDER BY ranked.match_rank ASC, ranked.is_stale ASC, ranked.last_validated_at DESC NULLS LAST
      LIMIT ${limit}
    `;
    return rows
      .map((row) => hydrateFood(row, row.is_stale))
      .filter((food): food is CanonicalFood => food !== null);
  },

  /**
   * Expired provider records are retained as Diewish's resilience layer.
   * They are never presented as fresh facts: provenance.stale is always true.
   */
  async searchLocalStale(query: string, limit: number, now = new Date()): Promise<CanonicalFood[]> {
    const normalized = normalizeAlias(query);
    if (!normalized) return [];
    const pattern = `%${normalized}%`;
    const rows = await prisma.$queryRaw<Array<FoodRow>>`
      SELECT ranked.payload, ranked.expires_at, ranked.last_validated_at, ranked.payload_hash
      FROM (
        SELECT DISTINCT ON (f.provider, f.external_id)
          f.provider,
          f.external_id,
          f.payload,
          f.retrieved_at,
          f.expires_at,
          f.last_validated_at,
          f.payload_hash
        FROM nutrition_foods f
        LEFT JOIN nutrition_food_aliases a
          ON a.provider = f.provider AND a.external_id = f.external_id
        WHERE f.expires_at <= ${now}
          AND (
            LOWER(f.display_name_tr) LIKE ${pattern}
            OR LOWER(f.name) LIKE ${pattern}
            OR a.normalized_alias LIKE ${pattern}
          )
        ORDER BY f.provider, f.external_id, COALESCE(f.last_validated_at, f.retrieved_at) DESC
      ) ranked
      ORDER BY COALESCE(ranked.last_validated_at, ranked.retrieved_at) DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => hydrateFood(row, true)).filter((food): food is CanonicalFood => food !== null);
  },

  /**
   * Remembers a user-facing search term only when the service has already
   * selected a sufficiently relevant verified provider record.
   */
  async rememberSearchAlias(query: string, food: CanonicalFood, confidence: number): Promise<void> {
    const alias = query.trim().slice(0, 120);
    const normalized = normalizeAlias(alias);
    if (!normalized) return;
    const boundedConfidence = Math.max(0, Math.min(1, confidence));
    await prisma.$executeRaw`
      INSERT INTO nutrition_food_aliases (alias, normalized_alias, provider, external_id, confidence)
      VALUES (${alias}, ${normalized}, ${food.provider}, ${food.externalId}, ${boundedConfidence})
      ON CONFLICT (normalized_alias, provider, external_id) DO UPDATE SET
        alias = EXCLUDED.alias,
        confidence = GREATEST(nutrition_food_aliases.confidence, EXCLUDED.confidence)
    `;
  },

  async upsertFood(food: CanonicalFood, expiresAt: Date): Promise<void> {
    const validatedAt = new Date();
    const enriched: CanonicalFood = {
      ...food,
      provenance: { ...food.provenance, lastValidatedAt: validatedAt.toISOString(), stale: false },
    };
    const payload = JSON.stringify(enriched);
    const hash = payloadHash(payload);
    await prisma.$executeRaw`
      INSERT INTO nutrition_foods
        (provider, external_id, barcode, name, display_name_tr, brand, payload, retrieved_at, expires_at, last_validated_at, payload_hash, updated_at)
      VALUES
        (${food.provider}, ${food.externalId}, ${food.barcode}, ${food.name}, ${food.displayNameTr}, ${food.brand}, ${payload}::jsonb, ${new Date(food.provenance.retrievedAt)}, ${expiresAt}, ${validatedAt}, ${hash}, CURRENT_TIMESTAMP)
      ON CONFLICT (provider, external_id) DO UPDATE SET
        barcode = EXCLUDED.barcode,
        name = EXCLUDED.name,
        display_name_tr = EXCLUDED.display_name_tr,
        brand = EXCLUDED.brand,
        payload = EXCLUDED.payload,
        retrieved_at = EXCLUDED.retrieved_at,
        expires_at = EXCLUDED.expires_at,
        last_validated_at = EXCLUDED.last_validated_at,
        payload_hash = EXCLUDED.payload_hash,
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

  /**
   * Replaces a bulk reference-provider snapshot without issuing thousands of
   * per-food alias writes. CIQUAL/CoFID names remain searchable directly from
   * nutrition_foods, while learned Turkish aliases stay in their own table.
   */
  async syncReferenceFoods(
    provider: ReferenceNutritionProvider,
    foods: readonly CanonicalFood[],
    expiresAt: Date,
  ): Promise<number> {
    if (foods.length < 1_000) {
      throw new Error(`Refusing suspiciously small ${provider} reference snapshot: ${foods.length}`);
    }
    if (foods.some((food) => food.provider !== provider)) {
      throw new Error(`Reference snapshot contains a provider other than ${provider}`);
    }

    const validatedAt = new Date();
    const marker = validatedAt.toISOString();
    const chunkSize = 250;

    for (let offset = 0; offset < foods.length; offset += chunkSize) {
      const records = foods.slice(offset, offset + chunkSize).map((food) => {
        const enriched: CanonicalFood = {
          ...food,
          provenance: {
            ...food.provenance,
            lastValidatedAt: marker,
            stale: false,
          },
        };
        const payload = JSON.stringify(enriched);
        return {
          provider: food.provider,
          external_id: food.externalId,
          barcode: food.barcode,
          name: food.name,
          display_name_tr: food.displayNameTr,
          brand: food.brand,
          payload: enriched,
          retrieved_at: food.provenance.retrievedAt,
          expires_at: expiresAt.toISOString(),
          last_validated_at: marker,
          payload_hash: payloadHash(payload),
          updated_at: marker,
        };
      });

      const serialized = JSON.stringify(records);
      await prisma.$executeRaw`
        INSERT INTO nutrition_foods
          (provider, external_id, barcode, name, display_name_tr, brand, payload, retrieved_at, expires_at, last_validated_at, payload_hash, updated_at)
        SELECT
          x.provider,
          x.external_id,
          x.barcode,
          x.name,
          x.display_name_tr,
          x.brand,
          x.payload,
          x.retrieved_at::timestamptz,
          x.expires_at::timestamptz,
          x.last_validated_at::timestamptz,
          x.payload_hash,
          x.updated_at::timestamptz
        FROM jsonb_to_recordset(${serialized}::jsonb) AS x(
          provider text,
          external_id text,
          barcode text,
          name text,
          display_name_tr text,
          brand text,
          payload jsonb,
          retrieved_at text,
          expires_at text,
          last_validated_at text,
          payload_hash text,
          updated_at text
        )
        ON CONFLICT (provider, external_id) DO UPDATE SET
          barcode = EXCLUDED.barcode,
          name = EXCLUDED.name,
          display_name_tr = EXCLUDED.display_name_tr,
          brand = EXCLUDED.brand,
          payload = EXCLUDED.payload,
          retrieved_at = EXCLUDED.retrieved_at,
          expires_at = EXCLUDED.expires_at,
          last_validated_at = EXCLUDED.last_validated_at,
          payload_hash = EXCLUDED.payload_hash,
          updated_at = EXCLUDED.updated_at
      `;
    }

    await prisma.$executeRaw`
      DELETE FROM nutrition_foods
      WHERE provider = ${provider}
        AND updated_at < ${validatedAt}
    `;
    await prisma.$executeRaw`
      DELETE FROM nutrition_food_aliases a
      WHERE a.provider = ${provider}
        AND NOT EXISTS (
          SELECT 1
          FROM nutrition_foods f
          WHERE f.provider = a.provider
            AND f.external_id = a.external_id
        )
    `;

    return foods.length;
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
    lastViewedAt: string | null;
  }>> {
    const rows = await prisma.$queryRaw<ScanRow[]>`
      SELECT barcode, provider, product_name, payload, scanned_at
      FROM nutrition_barcode_scans
      WHERE user_id = ${userId}
      ORDER BY COALESCE(last_viewed_at, scanned_at) DESC, scanned_at DESC
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

  async recordPhotoScan(userId: string, input: PhotoScanHistoryInput): Promise<void> {
    const payload = JSON.stringify(input);
    await prisma.$executeRaw`
      INSERT INTO nutrition_photo_scans
        (user_id, dish_name, portion_text, portion_grams, calories, payload)
      VALUES
        (${userId}, ${input.dishName}, ${input.estimatedPortion}, ${input.estimatedGrams}, ${input.totals.energyKcal}, ${payload}::jsonb)
    `;
  },

  async listScanHistory(userId: string, limit: number): Promise<Array<{
    id: string;
    scanType: "PHOTO" | "BARCODE";
    title: string;
    brand: string | null;
    barcode: string | null;
    imageUrl: string | null;
    grams: number | null;
    calories: number | null;
    food: CanonicalFood | null;
    photo: PhotoScanHistoryInput | null;
    scannedAt: string;
  }>> {
    const rows = await prisma.$queryRaw<UnifiedScanRow[]>`
      SELECT *
      FROM (
        SELECT
          ('barcode:' || id::text) AS history_id,
          'BARCODE'::text AS scan_type,
          barcode,
          product_name,
          payload,
          scanned_at,
          last_viewed_at
        FROM nutrition_barcode_scans
        WHERE user_id = ${userId}

        UNION ALL

        SELECT
          ('photo:' || id::text) AS history_id,
          'PHOTO'::text AS scan_type,
          NULL::text AS barcode,
          dish_name AS product_name,
          payload,
          scanned_at,
          last_viewed_at
        FROM nutrition_photo_scans
        WHERE user_id = ${userId}
      ) history
      ORDER BY scanned_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => {
      if (row.scan_type === "BARCODE") {
        const food = asFood(row.payload);
        return {
          id: row.history_id,
          scanType: "BARCODE" as const,
          title: food?.displayNameTr || food?.name || row.product_name || "Barkodlu ürün",
          brand: food?.brand ?? null,
          barcode: row.barcode,
          imageUrl: food?.imageUrl ?? null,
          // Barcode scan history is an observation event, not a consumption event.
          grams: null,
          calories: null,
          food,
          photo: null,
          scannedAt: row.scanned_at.toISOString(),
          lastViewedAt: row.last_viewed_at?.toISOString() ?? null,
        };
      }

      const photo = asPhotoScan(row.payload);
      return {
        id: row.history_id,
        scanType: "PHOTO" as const,
        title: photo?.dishName || row.product_name || "Fotoğraf taraması",
        brand: null,
        barcode: null,
        imageUrl: null,
        grams: photo?.estimatedGrams ?? null,
        calories: photo?.totals.energyKcal ?? null,
        food: null,
        photo,
        scannedAt: row.scanned_at.toISOString(),
        lastViewedAt: row.last_viewed_at?.toISOString() ?? null,
      };
    });
  },

  async markScanHistoryViewed(
    userId: string,
    scanType: "BARCODE" | "PHOTO",
    eventId: bigint,
    viewedAt = new Date(),
  ): Promise<boolean> {
    const updated =
      scanType === "BARCODE"
        ? await prisma.$executeRaw`
            UPDATE nutrition_barcode_scans
            SET last_viewed_at = ${viewedAt}
            WHERE user_id = ${userId} AND id = ${eventId}
          `
        : await prisma.$executeRaw`
            UPDATE nutrition_photo_scans
            SET last_viewed_at = ${viewedAt}
            WHERE user_id = ${userId} AND id = ${eventId}
          `;
    return updated > 0;
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
