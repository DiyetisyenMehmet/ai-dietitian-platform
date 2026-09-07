-- Persist a user's broad work/shift pattern without forcing legacy profiles to choose one.
CREATE TYPE "WorkScheduleType" AS ENUM ('REGULAR', 'VARIABLE_SHIFT', 'NIGHT_SHIFT');

ALTER TABLE "user_profiles"
ADD COLUMN "workScheduleType" "WorkScheduleType";
