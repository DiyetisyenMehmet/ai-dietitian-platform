-- Production-safe baseline reference ranges for blood-test normalization.
--
-- The existing TypeScript seed is not executed by `prisma migrate deploy`, so
-- production databases created only through migrations can legitimately have an
-- empty `blood_test_reference_ranges` table. These rows are a fallback only:
-- the uploaded laboratory's own printed range takes precedence in code.
--
-- Idempotence / preservation: insert a baseline only when no active universal
-- range already exists for that biomarker. Lab/country-specific/admin-managed
-- ranges are never deleted or overwritten.

WITH seed(
  "id", "biomarkerCode", "biomarkerName", "biomarkerNameTr", "unit",
  "minValue", "maxValue", "optimalMin", "optimalMax", "source", "notes"
) AS (
  VALUES
    ('seed-v1-wbc', 'WBC', 'White Blood Cells', 'Beyaz Kan Hücreleri', '10^3/uL', 4.0, 11.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-rbc', 'RBC', 'Red Blood Cells', 'Kırmızı Kan Hücreleri', '10^6/uL', 4.2, 5.9, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-hgb', 'HGB', 'Hemoglobin', 'Hemoglobin', 'g/dL', 12.0, 17.5, NULL, NULL, 'WHO', NULL),
    ('seed-v1-hct', 'HCT', 'Hematocrit', 'Hematokrit', '%', 36.0, 52.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-mcv', 'MCV', 'Mean Corpuscular Volume', 'Ortalama Eritrosit Hacmi', 'fL', 80.0, 100.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-mch', 'MCH', 'Mean Corpuscular Hemoglobin', 'Ortalama Eritrosit Hemoglobini', 'pg', 27.0, 33.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-mchc', 'MCHC', 'Mean Corpuscular Hemoglobin Concentration', 'Ortalama Eritrosit Hemoglobin Konsantrasyonu', 'g/dL', 32.0, 36.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-plt', 'PLT', 'Platelets', 'Trombositler', '10^3/uL', 150.0, 450.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-glucose', 'GLUCOSE', 'Glucose (Fasting)', 'Açlık Kan Şekeri', 'mg/dL', 70.0, 99.0, 70.0, 90.0, 'ADA', NULL),
    ('seed-v1-hba1c', 'HBA1C', 'Hemoglobin A1c', 'Hemoglobin A1c', '%', 4.0, 5.6, 4.0, 5.4, 'ADA', NULL),
    ('seed-v1-insulin', 'INSULIN', 'Insulin (Fasting)', 'Açlık İnsülini', 'uIU/mL', 2.6, 24.9, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-bun', 'BUN', 'Blood Urea Nitrogen', 'Kan Üre Azotu', 'mg/dL', 7.0, 20.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-creatinine', 'CREATININE', 'Creatinine', 'Kreatinin', 'mg/dL', 0.6, 1.3, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-egfr', 'EGFR', 'Estimated GFR', 'Tahmini GFR', 'mL/min/1.73m2', 90.0, NULL, NULL, NULL, 'STANDARD', '≥90 mL/min/1.73m² considered normal.'),
    ('seed-v1-total-cholesterol', 'TOTAL_CHOLESTEROL', 'Total Cholesterol', 'Total Kolesterol', 'mg/dL', 125.0, 200.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-ldl', 'LDL', 'LDL Cholesterol', 'LDL Kolesterol', 'mg/dL', NULL, 100.0, NULL, 100.0, 'STANDARD', NULL),
    ('seed-v1-hdl', 'HDL', 'HDL Cholesterol', 'HDL Kolesterol', 'mg/dL', 40.0, NULL, 60.0, NULL, 'STANDARD', NULL),
    ('seed-v1-triglycerides', 'TRIGLYCERIDES', 'Triglycerides', 'Trigliseritler', 'mg/dL', NULL, 150.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-vldl', 'VLDL', 'VLDL Cholesterol', 'VLDL Kolesterol', 'mg/dL', 2.0, 30.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-alt', 'ALT', 'Alanine Aminotransferase (ALT)', 'Alanin Aminotransferaz', 'U/L', 7.0, 56.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-ast', 'AST', 'Aspartate Aminotransferase (AST)', 'Aspartat Aminotransferaz', 'U/L', 8.0, 48.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-alp', 'ALP', 'Alkaline Phosphatase', 'Alkalen Fosfataz', 'U/L', 44.0, 147.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-bilirubin-total', 'BILIRUBIN_TOTAL', 'Total Bilirubin', 'Total Bilirubin', 'mg/dL', 0.1, 1.2, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-albumin', 'ALBUMIN', 'Albumin', 'Albümin', 'g/dL', 3.5, 5.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-tsh', 'TSH', 'Thyroid Stimulating Hormone', 'Tiroid Uyarıcı Hormon', 'uIU/mL', 0.4, 4.0, 0.5, 2.5, 'ATA', NULL),
    ('seed-v1-ft3', 'FT3', 'Free T3', 'Serbest T3', 'pg/mL', 2.3, 4.2, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-ft4', 'FT4', 'Free T4', 'Serbest T4', 'ng/dL', 0.8, 1.8, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-vitamin-d', 'VITAMIN_D', 'Vitamin D (25-OH)', 'D Vitamini (25-OH)', 'ng/mL', 30.0, 100.0, 40.0, 60.0, 'STANDARD', NULL),
    ('seed-v1-vitamin-b12', 'VITAMIN_B12', 'Vitamin B12', 'B12 Vitamini', 'pg/mL', 200.0, 900.0, 400.0, NULL, 'STANDARD', NULL),
    ('seed-v1-iron', 'IRON', 'Iron (Serum)', 'Demir (Serum)', 'ug/dL', 60.0, 170.0, NULL, NULL, 'STANDARD', NULL),
    ('seed-v1-ferritin', 'FERRITIN', 'Ferritin', 'Ferritin', 'ng/mL', 30.0, 400.0, 50.0, NULL, 'STANDARD', NULL),
    ('seed-v1-folate', 'FOLATE', 'Folate', 'Folat', 'ng/mL', 3.0, 20.0, NULL, NULL, 'STANDARD', NULL)
)
INSERT INTO "blood_test_reference_ranges" (
  "id", "createdAt", "updatedAt", "biomarkerCode", "biomarkerName",
  "biomarkerNameTr", "unit", "minValue", "maxValue", "optimalMin",
  "optimalMax", "gender", "ageMin", "ageMax", "country",
  "laboratoryId", "isActive", "source", "notes"
)
SELECT
  s."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, s."biomarkerCode", s."biomarkerName",
  s."biomarkerNameTr", s."unit", s."minValue", s."maxValue", s."optimalMin",
  s."optimalMax", 'ALL'::"ReferenceRangeGender", 18, NULL, NULL,
  NULL, TRUE, s."source", s."notes"
FROM seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM "blood_test_reference_ranges" existing
  WHERE existing."biomarkerCode" = s."biomarkerCode"
    AND existing."gender" = 'ALL'::"ReferenceRangeGender"
    AND existing."country" IS NULL
    AND existing."laboratoryId" IS NULL
    AND existing."isActive" = TRUE
);
