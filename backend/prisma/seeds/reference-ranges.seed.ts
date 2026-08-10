/**
 * Diewish — Blood-test reference-range seed (Sprint 12).
 *
 * Seeds ~30 common biomarkers with standard, universal (gender = ALL) adult
 * reference ranges sourced from widely used clinical guidelines (WHO/ADA/ATA
 * and common laboratory conventions). Values are intentionally generic; more
 * specific gender/age/country/lab ranges can be layered on top via the admin
 * reference-ranges API without touching this baseline.
 *
 * Run standalone:  npx tsx prisma/seeds/reference-ranges.seed.ts
 *   (or)           npx ts-node prisma/seeds/reference-ranges.seed.ts
 */

import { PrismaClient } from "@prisma/client";

import { BIOMARKERS } from "../../src/modules/blood-test-analysis/normalization/biomarker-aliases.map";

const prisma = new PrismaClient();

/** A single seed row (name/unit are pulled from the canonical registry). */
interface SeedRange {
  code: string;
  biomarkerNameTr: string;
  minValue: number | null;
  maxValue: number | null;
  optimalMin?: number | null;
  optimalMax?: number | null;
  source: string;
  notes?: string;
}

/** Standard adult, universal reference ranges. */
const SEED_RANGES: SeedRange[] = [
  // Complete Blood Count
  { code: "WBC", biomarkerNameTr: "Beyaz Kan Hücreleri", minValue: 4.0, maxValue: 11.0, source: "STANDARD" },
  { code: "RBC", biomarkerNameTr: "Kırmızı Kan Hücreleri", minValue: 4.2, maxValue: 5.9, source: "STANDARD" },
  { code: "HGB", biomarkerNameTr: "Hemoglobin", minValue: 12.0, maxValue: 17.5, source: "WHO" },
  { code: "HCT", biomarkerNameTr: "Hematokrit", minValue: 36.0, maxValue: 52.0, source: "STANDARD" },
  { code: "MCV", biomarkerNameTr: "Ortalama Eritrosit Hacmi", minValue: 80.0, maxValue: 100.0, source: "STANDARD" },
  { code: "MCH", biomarkerNameTr: "Ortalama Eritrosit Hemoglobini", minValue: 27.0, maxValue: 33.0, source: "STANDARD" },
  { code: "MCHC", biomarkerNameTr: "Ortalama Eritrosit Hemoglobin Konsantrasyonu", minValue: 32.0, maxValue: 36.0, source: "STANDARD" },
  { code: "PLT", biomarkerNameTr: "Trombositler", minValue: 150.0, maxValue: 450.0, source: "STANDARD" },
  // Metabolic Panel
  { code: "GLUCOSE", biomarkerNameTr: "Açlık Kan Şekeri", minValue: 70.0, maxValue: 99.0, optimalMin: 70.0, optimalMax: 90.0, source: "ADA" },
  { code: "HBA1C", biomarkerNameTr: "Hemoglobin A1c", minValue: 4.0, maxValue: 5.6, optimalMin: 4.0, optimalMax: 5.4, source: "ADA" },
  { code: "INSULIN", biomarkerNameTr: "Açlık İnsülini", minValue: 2.6, maxValue: 24.9, source: "STANDARD" },
  { code: "BUN", biomarkerNameTr: "Kan Üre Azotu", minValue: 7.0, maxValue: 20.0, source: "STANDARD" },
  { code: "CREATININE", biomarkerNameTr: "Kreatinin", minValue: 0.6, maxValue: 1.3, source: "STANDARD" },
  { code: "EGFR", biomarkerNameTr: "Tahmini GFR", minValue: 90.0, maxValue: null, source: "STANDARD", notes: "≥90 mL/min/1.73m² considered normal." },
  // Lipid Panel
  { code: "TOTAL_CHOLESTEROL", biomarkerNameTr: "Total Kolesterol", minValue: 125.0, maxValue: 200.0, source: "STANDARD" },
  { code: "LDL", biomarkerNameTr: "LDL Kolesterol", minValue: null, maxValue: 100.0, optimalMax: 100.0, source: "STANDARD" },
  { code: "HDL", biomarkerNameTr: "HDL Kolesterol", minValue: 40.0, maxValue: null, optimalMin: 60.0, source: "STANDARD" },
  { code: "TRIGLYCERIDES", biomarkerNameTr: "Trigliseritler", minValue: null, maxValue: 150.0, source: "STANDARD" },
  { code: "VLDL", biomarkerNameTr: "VLDL Kolesterol", minValue: 2.0, maxValue: 30.0, source: "STANDARD" },
  // Liver Function
  { code: "ALT", biomarkerNameTr: "Alanin Aminotransferaz", minValue: 7.0, maxValue: 56.0, source: "STANDARD" },
  { code: "AST", biomarkerNameTr: "Aspartat Aminotransferaz", minValue: 8.0, maxValue: 48.0, source: "STANDARD" },
  { code: "ALP", biomarkerNameTr: "Alkalen Fosfataz", minValue: 44.0, maxValue: 147.0, source: "STANDARD" },
  { code: "BILIRUBIN_TOTAL", biomarkerNameTr: "Total Bilirubin", minValue: 0.1, maxValue: 1.2, source: "STANDARD" },
  { code: "ALBUMIN", biomarkerNameTr: "Albümin", minValue: 3.5, maxValue: 5.0, source: "STANDARD" },
  // Thyroid
  { code: "TSH", biomarkerNameTr: "Tiroid Uyarıcı Hormon", minValue: 0.4, maxValue: 4.0, optimalMin: 0.5, optimalMax: 2.5, source: "ATA" },
  { code: "FT3", biomarkerNameTr: "Serbest T3", minValue: 2.3, maxValue: 4.2, source: "STANDARD" },
  { code: "FT4", biomarkerNameTr: "Serbest T4", minValue: 0.8, maxValue: 1.8, source: "STANDARD" },
  // Vitamins & Minerals
  { code: "VITAMIN_D", biomarkerNameTr: "D Vitamini (25-OH)", minValue: 30.0, maxValue: 100.0, optimalMin: 40.0, optimalMax: 60.0, source: "STANDARD" },
  { code: "VITAMIN_B12", biomarkerNameTr: "B12 Vitamini", minValue: 200.0, maxValue: 900.0, optimalMin: 400.0, source: "STANDARD" },
  { code: "IRON", biomarkerNameTr: "Demir (Serum)", minValue: 60.0, maxValue: 170.0, source: "STANDARD" },
  { code: "FERRITIN", biomarkerNameTr: "Ferritin", minValue: 30.0, maxValue: 400.0, optimalMin: 50.0, source: "STANDARD" },
  { code: "FOLATE", biomarkerNameTr: "Folat", minValue: 3.0, maxValue: 20.0, source: "STANDARD" },
];

/**
 * Seeds the standard universal reference ranges idempotently: existing
 * STANDARD/universal rows for each code are removed first so re-running yields
 * a clean, deterministic baseline without duplicating user/lab-specific rows.
 */
export async function seedReferenceRanges(): Promise<number> {
  let count = 0;
  for (const seed of SEED_RANGES) {
    const definition = BIOMARKERS[seed.code];
    if (!definition) {
      throw new Error(`Unknown biomarker code in seed: ${seed.code}`);
    }

    // Remove any prior universal baseline row for this code before re-seeding.
    await prisma.bloodTestReferenceRange.deleteMany({
      where: {
        biomarkerCode: seed.code,
        gender: "ALL",
        country: null,
        laboratoryId: null,
      },
    });

    await prisma.bloodTestReferenceRange.create({
      data: {
        biomarkerCode: definition.code,
        biomarkerName: definition.name,
        biomarkerNameTr: seed.biomarkerNameTr,
        unit: definition.canonicalUnit,
        minValue: seed.minValue,
        maxValue: seed.maxValue,
        optimalMin: seed.optimalMin ?? null,
        optimalMax: seed.optimalMax ?? null,
        gender: "ALL",
        ageMin: 18,
        ageMax: null,
        country: null,
        laboratoryId: null,
        isActive: true,
        source: seed.source,
        notes: seed.notes ?? null,
      },
    });
    count += 1;
  }
  return count;
}

/** Standalone runner. */
async function main(): Promise<void> {
  const count = await seedReferenceRanges();
  console.log(`Diewish: seeded ${count} blood-test reference ranges.`);
}

// Execute only when run directly (not when imported by a seed aggregator).
if (require.main === module) {
  main()
    .catch((error) => {
      console.error("Diewish reference-range seed failed:", error);
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
