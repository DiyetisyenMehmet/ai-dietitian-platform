ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'PILATES';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'HOME_EXERCISE';

ALTER TABLE "activities"
  ADD COLUMN "distanceKm" DOUBLE PRECISION,
  ADD COLUMN "perceivedIntensity" INTEGER;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_distance_km_nonnegative" CHECK ("distanceKm" IS NULL OR "distanceKm" >= 0),
  ADD CONSTRAINT "activities_perceived_intensity_range" CHECK ("perceivedIntensity" IS NULL OR ("perceivedIntensity" >= 1 AND "perceivedIntensity" <= 10));
