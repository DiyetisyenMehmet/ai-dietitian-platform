# Diewish Nutrition Intelligence

Status: production-hardening implementation on `fix/production-hardening`.

## Purpose

Diewish uses one nutrition source-of-truth layer for manual food search, packaged-food barcode scans, photo-based meal recognition, comparisons, meal logging, personalization and AI Coach grounding. Numeric nutrition facts are never invented by the language/vision model.

## Source policy

### Generic foods

1. Fresh Diewish server-side cache / aliases.
2. USDA FoodData Central.
3. Values are normalized into the canonical `CanonicalFood` schema.

Common Turkish ingredient queries are deterministically expanded to an English-first USDA lookup (for example `tavuk göğsü -> chicken breast`) while retaining the original query as a bounded fallback. Only the food-name query is sent to USDA; profile, health, allergy and tracking data are not.

### Packaged foods / barcode

1. Fresh Diewish server-side cache.
2. Open Food Facts.
3. USDA Branded fallback.

The system never averages conflicting providers. The selected provider and external ID remain in provenance metadata.

## Canonical nutrition contract

Canonical nutrient values are normalized to a per-100-g basis where the provider makes that basis available:

- energy kcal
- protein
- carbohydrates
- fat
- saturated fat
- sugars
- fiber
- sodium
- salt

Missing values stay `null`; they are not converted to zero and are not estimated by AI.

Portion scaling, ingredient sums and same-calorie comparisons are deterministic TypeScript calculations in `nutrition-calculator.ts`.

## Persistent data

Migration `20260908142000_nutrition_intelligence_foundation` creates:

- `nutrition_foods` — server-side canonical provider cache
- `nutrition_food_aliases` — normalized search aliases
- `nutrition_barcode_scans` — owner-scoped scan history
- `nutrition_food_favorites` — owner-scoped favorites

Provider payloads are cached server-side. User profile/health context is not written into the provider cache.

## Photo meal flow

1. Client uploads an image to `/api/food-scan/analyze`.
2. Local image validation rejects blank, unreadable and obviously unsuitable images.
3. The configured vision provider returns only:
   - food/not-food verdict
   - confidence
   - dish name
   - approximate portion / grams
   - candidate ingredient names / grams / uncertainty
4. The AI response schema intentionally contains no kcal or macro fields.
5. Each recognized ingredient is resolved through the Nutrition Data Layer.
6. Calories and nutrients are calculated deterministically from verified provider data.
7. Unmatched ingredients remain explicit and contribute no invented nutrition values.
8. Users may include/exclude/edit ingredient names and grams; recalculation uses the same deterministic path.
9. The final result can be stored using the existing `/api/tracking/meals` model; no parallel meal-log system is introduced.

When `AI_PROVIDER=vertex`, food vision uses Google Cloud Vertex AI + Gemini through the runtime service identity / metadata server, matching the main AI strategy. Abacus and OpenAI-compatible paths remain configurable fallbacks.

## Barcode client flow

The scanner accepts EAN-8, UPC-A and EAN-13 check-digit-valid codes, performs on-device detection where supported and always retains manual entry as a fallback.

The result surface supports:

- provider-backed product identity
- adjustable serving grams
- deterministic calories/macros and extended nutrients
- favorites/history
- `Senin İçin` personalization
- same-calorie alternatives
- logging to the existing meal tracker
- AI Coach follow-up

## `Senin İçin` personalization

Personalization is computed locally inside Diewish after verified nutrition values are known. It may use:

- the active deterministic nutrition-plan targets
- the user's recorded meals in the recent 24-hour window
- dietary preference / allergy metadata for compatibility warnings

It derives target contribution, remaining calories/macros, portion-fit and bounded satiety heuristics. It does not send profile or health context to USDA or Open Food Facts.

Allergen safety is conservative: absence of allergen metadata is not treated as proof that a product is allergen-free.

## AI Coach grounding

For supported factual food questions, AI Chat first resolves a bounded food-name/gram query through `NutritionDataService`. The resulting `nutritionGrounding` object contains verified provider values and an explicit rule that the model may explain but must not modify or invent numeric facts.

The existing PHI-minimized profile/plan/tracking context remains separate from the provider food lookup.

## Main API surface

Authenticated nutrition routes also require current mandatory legal consent:

- `GET /api/nutrition/search?q=...`
- `GET /api/nutrition/barcode/:barcode`
- `GET /api/nutrition/history`
- `GET /api/nutrition/favorites`
- `POST /api/nutrition/barcode/:barcode/favorite`
- `POST /api/nutrition/personalize`
- `POST /api/nutrition/personalize-nutrients`
- `POST /api/nutrition/compare`
- `POST /api/food-scan/analyze`
- `POST /api/food-scan/recalculate`

## Environment

Required for generic live food search:

- `USDA_FDC_API_KEY`

Packaged barcode source configuration:

- `OPEN_FOOD_FACTS_BASE_URL`
- `OPEN_FOOD_FACTS_USER_AGENT`

Primary AI production direction:

- `AI_PROVIDER=vertex`
- `GOOGLE_CLOUD_PROJECT`
- `VERTEX_AI_LOCATION`
- `VERTEX_AI_MODEL`

Vertex credentials are supplied by the runtime service identity. Do not store service-account private keys in the repository or client application.

## Quality and safety invariants

- Provider credentials are backend-only.
- No profile/health payload is sent to USDA/Open Food Facts.
- AI does not generate numeric nutrition facts for scanned meals.
- Missing provider values remain missing.
- Barcode format/checksum is validated before provider work.
- User-owned history/favorites are scoped by authenticated user ID.
- Nutrition writes remain behind consent middleware.
- Migrations must pass against a fresh PostgreSQL database.
- Unit, integration, frontend build, Android build and browser E2E are mandatory exact-SHA CI gates before the phase is considered complete.

## Known limitations

- USDA coverage and terminology are strongest in English; the Turkish alias table is intentionally bounded and should grow from observed, reviewed search misses rather than uncontrolled machine translation.
- Open Food Facts is community-maintained; field completeness varies by product.
- Image portion and ingredient recognition remain estimates even though the numeric nutrition arithmetic is deterministic afterward.
- A same-calorie alternative is not nutritionally equivalent; macro/fiber/sugar differences are shown separately.
