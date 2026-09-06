-- Add the new user-selectable nutrition plan horizons.
-- SIXTY_DAY intentionally remains in the PostgreSQL enum for backwards-compatible
-- reads of historical rows, but the API no longer accepts it for new plans.
ALTER TYPE "NutritionPlanDuration" ADD VALUE IF NOT EXISTS 'SEVEN_DAY';
ALTER TYPE "NutritionPlanDuration" ADD VALUE IF NOT EXISTS 'FOURTEEN_DAY';
